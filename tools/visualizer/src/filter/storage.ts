// Persistence shim for the shared filter state.
//
// The visualizer runs in two contexts:
//   1. Standalone web app (src/main.tsx → App.tsx) — uses localStorage.
//   2. VS Code webview (src/webview.tsx) — uses vscode.setState/getState
//      since localStorage is often restricted by webview CSP.
//
// Both backends serialize the same shape; Set<string> fields are stored
// as plain arrays.

const STORAGE_KEY = 'temporal-skills-visualizer-state'

export type PersistedFilter = {
  selectedFiles: string[]
  visibleTypes: string[]
}

export type PersistedPins = {
  files: boolean
  types: boolean
}

export type PersistedState = {
  treeFilter?: PersistedFilter
  graphFilter?: PersistedFilter
  treePins?: PersistedPins
  graphPins?: PersistedPins
  searchQuery?: string
}

interface VsCodeApi {
  getState: () => unknown
  setState: (state: unknown) => void
}

let vscodeApi: VsCodeApi | null = null
let vscodeApiResolved = false

function getVsCodeApi(): VsCodeApi | null {
  if (vscodeApiResolved) return vscodeApi
  vscodeApiResolved = true
  // acquireVsCodeApi can only be called once per webview. The webview
  // entry (src/webview.tsx) may have already called it. To avoid double-
  // acquire we look for a globally cached reference first.
  const w = window as unknown as {
    __twfVsCodeApi?: VsCodeApi
    acquireVsCodeApi?: () => VsCodeApi
  }
  if (w.__twfVsCodeApi) {
    vscodeApi = w.__twfVsCodeApi
    return vscodeApi
  }
  if (typeof w.acquireVsCodeApi === 'function') {
    try {
      vscodeApi = w.acquireVsCodeApi()
      w.__twfVsCodeApi = vscodeApi
      return vscodeApi
    } catch {
      // Already acquired elsewhere without caching — fall through to localStorage.
      return null
    }
  }
  return null
}

export function loadState(): PersistedState {
  const vs = getVsCodeApi()
  if (vs) {
    const raw = vs.getState()
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      const inner = obj[STORAGE_KEY]
      if (inner && typeof inner === 'object') {
        return inner as PersistedState
      }
    }
    return {}
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PersistedState
  } catch {
    return {}
  }
}

export function saveState(state: PersistedState): void {
  const vs = getVsCodeApi()
  if (vs) {
    // Preserve any sibling keys other consumers may have stored on the
    // webview state by reading-modifying-writing.
    const current = vs.getState()
    const base =
      current && typeof current === 'object' ? { ...(current as object) } : {}
    ;(base as Record<string, unknown>)[STORAGE_KEY] = state
    vs.setState(base)
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage quota exceeded or disabled — best-effort, ignore.
  }
}
