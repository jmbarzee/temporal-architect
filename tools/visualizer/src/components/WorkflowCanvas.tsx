import { selectionFor } from '../filter/types'
import React from 'react'
import { OntologyContext } from './graph-view/useOntology'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../graph/dimension'
import { pinnedFor, withSelection } from '../filter/types'
import { DEFAULT_ONTOLOGY } from '../adapter/node-types'
import './WorkflowCanvas.css'
import type { TWFFile, WorkflowDef, ActivityDef, WorkerDef, NamespaceDef, NexusServiceDef, SignalDecl, QueryDecl, UpdateDecl } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import { EMPTY_PARSER_GRAPH } from '../types/parser-graph'
import type { Decomposition } from '../types/decomposition'
import type { DecompositionParams } from './protocol'
import { TreeView } from './TreeView'
import { GraphView } from './GraphView'
import type { FilterState, PinState, ViewTransition, FilterDimension } from '../filter/types'
import { reconcileFilter } from '../filter/reconcile'
import { loadState, saveState, type PersistedFilter, type PersistedPins, type StorageConfig } from '../filter/storage'
import { DEF_TYPE_CONFIGS } from '../theme/temporal-theme'

interface WorkflowCanvasProps {
  /** Parsed TWF AST to visualize. Produced by `twf parse` (the `definitions`
   * payload of the envelope) or constructed by a host application. The
   * tree view consumes this directly; the graph view consults it as
   * secondary input (sourceFile / hover details). */
  ast: TWFFile
  /** Resolved deployment graph from `twf graph`. Primary input for the
   * graph view; the tree view doesn't consume it. Optional — when absent
   * the graph view renders an empty graph (no errors, just nothing to
   * draw), which is the right behaviour for hosts that don't yet ship
   * `twf graph` output (older extension builds, AST-only fixtures). */
  parserGraph?: ParserGraph
  /** Decomposition from `twf graph chunks` — drives the Graph view's group
   * overlay. Optional and additive: when absent the overlay is inert (no
   * Groups modal content). The tree view does not consume it. */
  decomposition?: Decomposition
  /** Invoked when the user narrows the file filter to exactly one file —
   * a hint to host applications (e.g. VS Code) to focus that file in their
   * editor. Optional; ignored when not provided. */
  onOpenFile?: (file: string) => void
  /** Invoked when the user interacts with the canvas in a way that implies
   * "give focus back to the editor" (currently any click inside the canvas).
   * Host applications wire this to whatever "refocus editor" means in their
   * environment. Optional; no-op when not provided. */
  onRefocus?: () => void
  /** Invoked when the user adjusts decomposition parameters in the Graph view's
   * Groups panel and asks to recompute. Host applications translate the
   * `DecompositionParams` into a fresh `twf graph chunks` run and feed the result
   * back through the `decomposition` prop. Optional; when absent the Groups
   * panel's Params tab stays a read-only readout. */
  onRequestDecomposition?: (params: DecompositionParams) => void
  /** Optional className applied to the outer container; appended after the
   * built-in `view-shell` class so consumers can layer overrides. */
  className?: string
  /** Optional inline style applied to the outer container. */
  style?: React.CSSProperties
}

export interface DefinitionContext {
  workflows: Map<string, WorkflowDef>
  activities: Map<string, ActivityDef>
  workers: Map<string, WorkerDef>
  nexusServices: Map<string, NexusServiceDef>
  namespaces: Map<string, NamespaceDef>
}

// Context for looking up signal/query/update handlers in the current workflow
export interface HandlerContext {
  signals: Map<string, SignalDecl>
  queries: Map<string, QueryDecl>
  updates: Map<string, UpdateDecl>
}

export const DefinitionContext = React.createContext<DefinitionContext>({
  workflows: new Map(),
  activities: new Map(),
  workers: new Map(),
  nexusServices: new Map(),
  namespaces: new Map(),
})

export const HandlerContext = React.createContext<HandlerContext>({
  signals: new Map(),
  queries: new Map(),
  updates: new Map(),
})

// Reverse reference index for contextual navigation
export interface CallerRef {
  defName: string
  defType: string
}

export interface NavigationContextType {
  callers: Map<string, CallerRef[]>
  workerOf: Map<string, string[]>
  namespaceOf: Map<string, string[]>
  navigateTo: (name: string, defType: string) => void
  showInGraph?: (name: string, defType: string) => void
}

export const NavigationContext = React.createContext<NavigationContextType>({
  callers: new Map(),
  workerOf: new Map(),
  namespaceOf: new Map(),
  navigateTo: () => {},
})

// Cross-view focus target — carries the visual-focus subject across a
// focus transition. The filter expansion has already happened in the
// reconciler by the time the destination view sees this; the view only
// uses it to scroll/center/flash.
export interface CrossViewTarget {
  name: string
  defType: string
}

type ActiveView = 'tree' | 'graph'

// This host's persistence identity. It lives here, outside the §6.5 manifest,
// because a storage key naming a product and the global a webview caches its API
// on are host facts — the library owns the shape of what is persisted, not where.
const STORAGE: StorageConfig = {
  key: 'temporal-architect-visualizer-state',
  hostApiGlobal: '__twfVsCodeApi',
}

const DEFAULT_VISIBLE_TYPES_ARRAY = DEF_TYPE_CONFIGS.filter(c => c.defaultOn).map(c => c.type)

function defaultFilter(ast: TWFFile): FilterState {
  return new Map([
    [SOURCE_FILE_DIMENSION, ast.focusedFile ? new Set([ast.focusedFile]) : new Set<string>()],
    [DEF_TYPE_DIMENSION, new Set(DEFAULT_VISIBLE_TYPES_ARRAY)],
  ])
}

const DEFAULT_PINS: PinState = new Map([
  [SOURCE_FILE_DIMENSION, false],
  [DEF_TYPE_DIMENSION, false],
])

// Both directions iterate whatever axes the value carries, rather than naming
// two. Naming them would still have *typechecked* against the axis-keyed
// `Record<string, …>` — it would simply have persisted two axes called
// `selectedFiles` and `visibleTypes`, which on reload is an empty allow-list on
// the real type axis, i.e. a blank graph. The version guard in storage.ts is the
// backstop; being generic here is the fix.
function persistedToFilter(p: PersistedFilter | undefined, fallback: FilterState): FilterState {
  if (!p) return fallback
  return new Map(Object.entries(p).map(([dimension, values]) => [dimension, new Set(values)]))
}

function filterToPersisted(f: FilterState): PersistedFilter {
  const out: PersistedFilter = {}
  for (const [dimension, values] of f) out[dimension] = Array.from(values)
  return out
}

function persistedToPins(p: PersistedPins | undefined, fallback: PinState): PinState {
  if (!p) return fallback
  return new Map(Object.entries(p))
}

function pinsToPersisted(pins: PinState): PersistedPins {
  const out: PersistedPins = {}
  for (const [dimension, pinned] of pins) out[dimension] = pinned
  return out
}

export function WorkflowCanvas({ ast, parserGraph, decomposition, onOpenFile, onRefocus, onRequestDecomposition, className, style }: WorkflowCanvasProps) {
  const graphInput = parserGraph ?? EMPTY_PARSER_GRAPH
  // History mode: a graph-only payload (e.g. the sampler's observed graph) has
  // no AST definitions. The Tree view has nothing to render, so we hide its tab
  // and default to the Graph view.
  const historyMode = ast.definitions.length === 0
  // Load persisted state once on mount. Sets are restored as Set<string>
  // from their array representation.
  const persisted = React.useMemo(() => loadState(STORAGE), [])

  const [activeView, setActiveView] = React.useState<ActiveView>(historyMode ? 'graph' : 'tree')

  // Keep-alive: the Graph view is mounted lazily (the first time it's shown)
  // and then kept mounted — hidden, not unmounted — when the user switches
  // away, so its viewport/layout survive a round-trip to the Tree view. We
  // mount it lazily rather than on first render so its one-shot initial fit
  // happens while it's visible (a hidden 0×0 container would fit to nothing).
  const [graphEverShown, setGraphEverShown] = React.useState(historyMode)

  // Per-view structural filter state, lifted from each view so the
  // reconciler at switch time has access to both.
  const [treeFilter, setTreeFilter] = React.useState<FilterState>(() =>
    persistedToFilter(persisted.treeFilter, defaultFilter(ast))
  )
  const [graphFilter, setGraphFilter] = React.useState<FilterState>(() =>
    persistedToFilter(persisted.graphFilter, defaultFilter(ast))
  )

  // Per-view pin state — when a dimension is pinned, the manual reconciler
  // skips it; focus transitions can still override pins (with a flash).
  // Which axes each view shows, in order (R17-R19). The default is the host's
  // declared order, so "default displayed filters" is configurable by declaring
  // a different taxonomy rather than by a setting.
  const DEFAULT_CHAIN = React.useMemo(
    () => DEFAULT_ONTOLOGY.filterDimensions.map(d => d.id), [])
  const [treeChain, setTreeChain] = React.useState<readonly string[]>(
    () => persisted.treeChain ?? DEFAULT_CHAIN)
  const [graphChain, setGraphChain] = React.useState<readonly string[]>(
    () => persisted.graphChain ?? DEFAULT_CHAIN)

  const [treePins, setTreePins] = React.useState<PinState>(() => persistedToPins(persisted.treePins, DEFAULT_PINS))
  const [graphPins, setGraphPins] = React.useState<PinState>(() => persistedToPins(persisted.graphPins, DEFAULT_PINS))

  // Globally-shared search state — one query applied identically to both
  // views (spec § Search Scope). Search is non-destructive (dim, not hide)
  // so sharing is safe.
  const [searchQuery, setSearchQuery] = React.useState<string>(persisted.searchQuery ?? '')
  const [searchActive, setSearchActive] = React.useState<boolean>(false)

  // Pending-focus target for cross-view nav. Reconciler has already
  // expanded the destination's filter by the time this is set; the
  // destination view consumes it for scroll/center/flash only.
  const [pendingFocus, setPendingFocus] = React.useState<CrossViewTarget | null>(null)

  // Pin-override metadata: which dimensions the most recent focus
  // transition bypassed in each view. The view consumes this on render
  // to flash its pin icon, then calls back to clear.
  const [treeOverriddenPins, setTreeOverriddenPins] = React.useState<Set<FilterDimension>>(new Set())
  const [graphOverriddenPins, setGraphOverriddenPins] = React.useState<Set<FilterDimension>>(new Set())

  // Persist on every relevant state change. localStorage in standalone;
  // vscode.setState in webview (via the storage shim).
  React.useEffect(() => {
    saveState(STORAGE, {
      treeFilter: filterToPersisted(treeFilter),
      graphFilter: filterToPersisted(graphFilter),
      treeChain: [...treeChain],
      graphChain: [...graphChain],
      treePins: pinsToPersisted(treePins),
      graphPins: pinsToPersisted(graphPins),
      searchQuery,
    })
  }, [treeFilter, graphFilter, treePins, graphPins, treeChain, graphChain, searchQuery])

  // Stale file cleanup: when the AST changes, remove any selectedFiles
  // entries that no longer exist in either view. Pins are not touched —
  // a user who pinned the files dimension still has the dimension pinned
  // even if its contents shrink to empty.
  React.useEffect(() => {
    const allFiles = new Set<string>()
    for (const def of ast.definitions) {
      if (def.sourceFile) allFiles.add(def.sourceFile)
    }
    const prune = (prev: FilterState): FilterState => {
      const pruned = new Set([...selectionFor(prev, SOURCE_FILE_DIMENSION)].filter(f => allFiles.has(f)))
      if (pruned.size === selectionFor(prev, SOURCE_FILE_DIMENSION).size) return prev
      return withSelection(prev, SOURCE_FILE_DIMENSION, pruned)
    }
    setTreeFilter(prune)
    setGraphFilter(prune)
  }, [ast.definitions])

  // Focused-file auto-tracking (Tree only, preserves prior behavior).
  // When the editor's focused file changes, narrow the Tree to it — but
  // only when the Tree's files dimension is unpinned, since a pinned
  // user explicitly opted out of tracking.
  const treeFilePinned = pinnedFor(treePins, SOURCE_FILE_DIMENSION)
  const treeShowsFiles = treeChain.includes(SOURCE_FILE_DIMENSION)
  React.useEffect(() => {
    if (treeFilePinned) return
    // Do not repopulate an axis the Tree has removed — same reason as the
    // reconciler above.
    if (!treeShowsFiles) return
    if (ast.focusedFile) {
      setTreeFilter(prev => {
        const next = new Set([ast.focusedFile!])
        if (selectionFor(prev, SOURCE_FILE_DIMENSION).size === 1 && selectionFor(prev, SOURCE_FILE_DIMENSION).has(ast.focusedFile!)) return prev
        return withSelection(prev, SOURCE_FILE_DIMENSION, next)
      })
    }
    // Depends on the file axis's pin, NOT the whole PinState. Widening it to
    // the Map when pins became Maps meant pinning the KIND axis produced a new
    // Map, re-ran this effect, and silently reset the Tree's file selection to
    // the focused file.
  }, [ast.focusedFile, treeFilePinned, treeShowsFiles])

  // Build lookup maps for definitions (shared by both views)
  const context = React.useMemo<DefinitionContext>(() => {
    const workflows = new Map<string, WorkflowDef>()
    const activities = new Map<string, ActivityDef>()
    const workers = new Map<string, WorkerDef>()
    const nexusServices = new Map<string, NexusServiceDef>()
    const namespaces = new Map<string, NamespaceDef>()

    for (const def of ast.definitions) {
      if (def.type === 'workflowDef') {
        workflows.set(def.name, def)
      } else if (def.type === 'activityDef') {
        activities.set(def.name, def)
      } else if (def.type === 'workerDef') {
        workers.set(def.name, def)
      } else if (def.type === 'nexusServiceDef') {
        nexusServices.set(def.name, def)
      } else if (def.type === 'namespaceDef') {
        namespaces.set(def.name, def)
      }
    }

    return { workflows, activities, workers, nexusServices, namespaces }
  }, [ast])

  // The single entry point for all view switches. Reads the transition
  // intent, runs the reconciler, applies the result, and flips the
  // active view. See spec § View Transitions.
  const switchView = React.useCallback((target: ActiveView, transition: ViewTransition) => {
    // History mode has no Tree view; never switch to it (defensive — the
    // Tree tab button and "Show in Tree" affordances are hidden anyway).
    if (target === 'tree' && historyMode) return
    // Same-view manual click is a no-op; same-view focus is impossible
    // by construction (Show in [view] is always cross-view).
    if (target === activeView && transition.kind === 'manual') return

    const dest = target === 'tree' ? treeFilter : graphFilter
    const source = target === 'tree' ? graphFilter : treeFilter
    const destPins = target === 'tree' ? treePins : graphPins

    // Reconcile only the axes the DESTINATION displays.
    //
    // Passing every declared axis made removal non-durable: the reconciler
    // re-imported the other view's selection for an axis this view had removed,
    // so the next switch silently re-filtered the graph with no chip on screen
    // and no way to reach it — the exact invisible state D44 removes an axis to
    // prevent. An axis this view does not show is not filtering here, so there
    // is nothing for a manual adopt or a focus expansion to do.
    const destChain = target === 'tree' ? treeChain : graphChain
    const destDimensions = destChain
      .map(id => DEFAULT_ONTOLOGY.descriptorFor(id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)

    const { filter: newFilter, overriddenPins } =
      reconcileFilter(dest, source, destPins, transition, destDimensions)

    if (target === 'tree') {
      if (newFilter !== dest) setTreeFilter(newFilter)
      setTreeOverriddenPins(overriddenPins)
    } else {
      if (newFilter !== dest) setGraphFilter(newFilter)
      setGraphOverriddenPins(overriddenPins)
    }

    if (transition.kind === 'focus') {
      setPendingFocus({
        name: transition.target.name,
        defType: transition.target.values[DEF_TYPE_DIMENSION] ?? '',
      })
    }

    if (target === 'graph') setGraphEverShown(true)
    setActiveView(target)
  }, [activeView, treeFilter, graphFilter, treePins, graphPins, historyMode])

  // Cross-view focus actions invoked by per-view UI (tree's "Show in
  // Graph" contextual button, graph's right-click menu / toolbar button).
  // Look up the target's sourceFile so the reconciler can expand the
  // file filter if needed.
  const showInGraph = React.useCallback((name: string, defType: string) => {
    const def = ast.definitions.find(d => d.name === name && d.type === defType)
    switchView('graph', {
      kind: 'focus',
      target: {
        name,
        values: { [DEF_TYPE_DIMENSION]: defType, [SOURCE_FILE_DIMENSION]: def?.sourceFile },
      },
    })
  }, [ast.definitions, switchView])

  const showInTree = React.useCallback((name: string, defType: string) => {
    const def = ast.definitions.find(d => d.name === name && d.type === defType)
    switchView('tree', {
      kind: 'focus',
      target: {
        name,
        values: { [DEF_TYPE_DIMENSION]: defType, [SOURCE_FILE_DIMENSION]: def?.sourceFile },
      },
    })
  }, [ast.definitions, switchView])

  const clearPendingFocus = React.useCallback(() => setPendingFocus(null), [])

  const handleSearchChange = React.useCallback((query: string, active: boolean) => {
    setSearchQuery(query)
    setSearchActive(active)
  }, [])

  const clearTreeOverriddenPins = React.useCallback(() => {
    setTreeOverriddenPins(prev => prev.size === 0 ? prev : new Set())
  }, [])
  const clearGraphOverriddenPins = React.useCallback(() => {
    setGraphOverriddenPins(prev => prev.size === 0 ? prev : new Set())
  }, [])

  // When the Tree's file filter narrows to exactly one file, open it in
  // the editor (VS Code webview behavior).
  React.useEffect(() => {
    if (selectionFor(treeFilter, SOURCE_FILE_DIMENSION).size === 1 && onOpenFile) {
      onOpenFile(selectionFor(treeFilter, SOURCE_FILE_DIMENSION).values().next().value!)
    }
  }, [selectionFor(treeFilter, SOURCE_FILE_DIMENSION), onOpenFile])

  // Compose outer container className/style so consumers can layer overrides
  // without losing the built-in layout class.
  const shellClassName = className ? `view-shell ${className}` : 'view-shell'

  return (
    // The host supplies the taxonomy. This component is outside the library's
    // manifest, which is exactly why it is the one that names a domain: the
    // engine below it resolves everything through the container and never
    // imports the entries.
    <OntologyContext.Provider value={DEFAULT_ONTOLOGY}>
    <DefinitionContext.Provider value={context}>
      <div className={shellClassName} style={style} onClick={onRefocus}>
        <div className="tab-bar">
          {/* In history mode there's no AST to render as a tree, so the Tree
              tab is disabled rather than hidden — the wrapping span carries the
              tooltip because a disabled button swallows hover in some engines. */}
          <span
            className="tab-bar-btn-wrap"
            title={
              historyMode
                ? 'Tree view needs a .twf design source. This graph was derived from sampled runtime histories, which have no design AST.'
                : undefined
            }
          >
            <button
              className={`tab-bar-btn ${activeView === 'tree' ? 'active' : ''}`}
              onClick={() => switchView('tree', { kind: 'manual' })}
              disabled={historyMode}
            >
              Tree
            </button>
          </span>
          <button
            className={`tab-bar-btn ${activeView === 'graph' ? 'active' : ''}`}
            onClick={() => switchView('graph', { kind: 'manual' })}
          >
            Graph
          </button>
        </div>

        {/* Both views stay mounted (keep-alive) so their per-view state
            survives tab switches; the inactive one is hidden, not unmounted.
            The Tree view never mounts in history mode (no AST definitions). */}
        {!historyMode && (
          <div className={`view-pane${activeView === 'tree' ? '' : ' hidden'}`}>
            <TreeView
              active={activeView === 'tree'}
              ast={ast}
              onShowInGraph={showInGraph}
              filter={treeFilter}
              onFilterChange={setTreeFilter}
              pins={treePins}
              onPinsChange={setTreePins}
              chain={treeChain}
              onChainChange={setTreeChain}
              searchQuery={searchQuery}
              searchActive={searchActive}
              onSearchChange={handleSearchChange}
              pendingFocus={pendingFocus}
              onFocusConsumed={clearPendingFocus}
              overriddenPins={treeOverriddenPins}
              onOverriddenPinsConsumed={clearTreeOverriddenPins}
            />
          </div>
        )}
        {graphEverShown && (
          <div className={`view-pane${activeView === 'graph' ? '' : ' hidden'}`}>
            <GraphView
              active={activeView === 'graph'}
              ast={ast}
              parserGraph={graphInput}
              decomposition={decomposition}
              onRequestDecomposition={onRequestDecomposition}
              onShowInTree={historyMode ? undefined : showInTree}
              filter={graphFilter}
              onFilterChange={setGraphFilter}
              pins={graphPins}
              onPinsChange={setGraphPins}
              chain={graphChain}
              onChainChange={setGraphChain}
              searchQuery={searchQuery}
              searchActive={searchActive}
              onSearchChange={handleSearchChange}
              pendingFocus={pendingFocus}
              onFocusConsumed={clearPendingFocus}
              overriddenPins={graphOverriddenPins}
              onOverriddenPinsConsumed={clearGraphOverriddenPins}
            />
          </div>
        )}
      </div>
    </DefinitionContext.Provider>
    </OntologyContext.Provider>
  )
}
