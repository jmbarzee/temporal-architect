// Persistence shim for the shared filter state.
//
// The visualizer runs in two contexts:
//   1. Standalone web app (src/main.tsx → App.tsx) — uses localStorage.
//   2. VS Code webview (src/webview.tsx) — uses vscode.setState/getState
//      since localStorage is often restricted by webview CSP.
//
// Both backends serialize the same shape; Set<string> fields are stored
// as plain arrays.

/**
 * Where and how this state is persisted — supplied by the host.
 *
 * Both fields used to be literals in this file: a storage key naming a specific
 * product, and the global a specific webview caches its API on. Neither is the
 * library's to know. The *shape* of what gets persisted is library business; the
 * key it lives under and the host bridge it talks to are not.
 */
export interface StorageConfig {
  /** localStorage key, and the field inside the webview's state object. */
  key: string
  /** Global the host caches its acquired webview API on, if it has one. */
  hostApiGlobal?: string
}

/**
 * Bumped whenever the persisted SHAPE changes. A mismatch discards rather than
 * migrates (D4).
 *
 * Discarding is the right default because the payload is a UI preference, not
 * user data: the cost of losing it is one re-toggle, and the cost of
 * mis-migrating it is a filter state that silently does not mean what it says.
 * Version 2 is the axis-keyed shape — v1's `{selectedFiles, visibleTypes}` would
 * have read as a filter with two axes named `selectedFiles` and `visibleTypes`,
 * each selecting nothing, i.e. an empty type allow-list, i.e. a blank graph.
 * That is exactly the failure a version guard exists to prevent.
 */
const STATE_VERSION = 2

/** A selection per axis, Sets flattened to arrays for JSON. */
export type PersistedFilter = Record<string, string[]>

/** A pin per axis. */
export type PersistedPins = Record<string, boolean>

export type PersistedState = {
  version?: number
  treeFilter?: PersistedFilter
  graphFilter?: PersistedFilter
  treePins?: PersistedPins
  graphPins?: PersistedPins
  /** Which axes each view shows, in order (R17-R19). */
  treeChain?: string[]
  graphChain?: string[]
  searchQuery?: string
}

interface VsCodeApi {
  getState: () => unknown
  setState: (state: unknown) => void
}

let vscodeApi: VsCodeApi | null = null
let vscodeApiResolved = false

function getVsCodeApi(config: StorageConfig): VsCodeApi | null {
  if (vscodeApiResolved) return vscodeApi
  vscodeApiResolved = true
  // acquireVsCodeApi can only be called once per webview. The webview
  // entry (src/webview.tsx) may have already called it. To avoid double-
  // acquire we look for a globally cached reference first.
  const w = window as unknown as { acquireVsCodeApi?: () => VsCodeApi }
  // `Reflect` rather than an index cast: the global's NAME is host-supplied, so
  // there is no static shape to assert, and asserting one anyway would just be
  // the cast §5.1 forbids wearing a different hat.
  const cacheKey = config.hostApiGlobal
  const cached = cacheKey ? Reflect.get(window, cacheKey) : undefined
  if (cached) {
    vscodeApi = cached as VsCodeApi
    return vscodeApi
  }
  if (typeof w.acquireVsCodeApi === 'function') {
    try {
      vscodeApi = w.acquireVsCodeApi()
      if (cacheKey) Reflect.set(window, cacheKey, vscodeApi)
      return vscodeApi
    } catch {
      // Already acquired elsewhere without caching — fall through to localStorage.
      return null
    }
  }
  return null
}

/** Discard anything not written by this exact shape version (D4). */
function accept(state: PersistedState | undefined): PersistedState {
  if (!state || state.version !== STATE_VERSION) return {}
  return state
}

export function loadState(config: StorageConfig): PersistedState {
  const vs = getVsCodeApi(config)
  if (vs) {
    const raw = vs.getState()
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      const inner = obj[config.key]
      if (inner && typeof inner === 'object') {
        return accept(inner as PersistedState)
      }
    }
    return {}
  }
  try {
    const raw = localStorage.getItem(config.key)
    if (!raw) return {}
    return accept(JSON.parse(raw) as PersistedState)
  } catch {
    return {}
  }
}

export function saveState(config: StorageConfig, state: PersistedState): void {
  state = { ...state, version: STATE_VERSION }
  const vs = getVsCodeApi(config)
  if (vs) {
    // Preserve any sibling keys other consumers may have stored on the
    // webview state by reading-modifying-writing.
    const current = vs.getState()
    const base =
      current && typeof current === 'object' ? { ...(current as object) } : {}
    ;(base as Record<string, unknown>)[config.key] = state
    vs.setState(base)
    return
  }
  try {
    localStorage.setItem(config.key, JSON.stringify(state))
  } catch {
    // Storage quota exceeded or disabled — best-effort, ignore.
  }
}
