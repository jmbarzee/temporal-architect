import React from 'react'
import type { TWFFile, WorkflowDef, ActivityDef, WorkerDef, NamespaceDef, NexusServiceDef, SignalDecl, QueryDecl, UpdateDecl } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import { EMPTY_PARSER_GRAPH } from '../types/parser-graph'
import { TreeView } from './TreeView'
import { GraphView } from './GraphView'
import type { FilterState, PinState, ViewTransition, FilterDimension } from '../filter/types'
import { reconcileFilter } from '../filter/reconcile'
import { loadState, saveState, type PersistedFilter } from '../filter/storage'
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
  /** Invoked when the user narrows the file filter to exactly one file —
   * a hint to host applications (e.g. VS Code) to focus that file in their
   * editor. Optional; ignored when not provided. */
  onOpenFile?: (file: string) => void
  /** Invoked when the user interacts with the canvas in a way that implies
   * "give focus back to the editor" (currently any click inside the canvas).
   * Host applications wire this to whatever "refocus editor" means in their
   * environment. Optional; no-op when not provided. */
  onRefocus?: () => void
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

const DEFAULT_VISIBLE_TYPES_ARRAY = DEF_TYPE_CONFIGS.filter(c => c.defaultOn).map(c => c.type)

function defaultFilter(ast: TWFFile): FilterState {
  return {
    selectedFiles: ast.focusedFile ? new Set([ast.focusedFile]) : new Set<string>(),
    visibleTypes: new Set(DEFAULT_VISIBLE_TYPES_ARRAY),
  }
}

const DEFAULT_PINS: PinState = { files: false, types: false }

function persistedToFilter(p: PersistedFilter | undefined, fallback: FilterState): FilterState {
  if (!p) return fallback
  return {
    selectedFiles: new Set(p.selectedFiles),
    visibleTypes: new Set(p.visibleTypes),
  }
}

function filterToPersisted(f: FilterState): PersistedFilter {
  return {
    selectedFiles: Array.from(f.selectedFiles),
    visibleTypes: Array.from(f.visibleTypes),
  }
}

export function WorkflowCanvas({ ast, parserGraph, onOpenFile, onRefocus, className, style }: WorkflowCanvasProps) {
  const graphInput = parserGraph ?? EMPTY_PARSER_GRAPH
  // History mode: a graph-only payload (e.g. `twf graph --history`) has no
  // AST definitions. The Tree view has nothing to render, so we hide its tab
  // and default to the Graph view.
  const historyMode = ast.definitions.length === 0
  // Load persisted state once on mount. Sets are restored as Set<string>
  // from their array representation.
  const persisted = React.useMemo(() => loadState(), [])

  const [activeView, setActiveView] = React.useState<ActiveView>(historyMode ? 'graph' : 'tree')

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
  const [treePins, setTreePins] = React.useState<PinState>(() => persisted.treePins ?? DEFAULT_PINS)
  const [graphPins, setGraphPins] = React.useState<PinState>(() => persisted.graphPins ?? DEFAULT_PINS)

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
    saveState({
      treeFilter: filterToPersisted(treeFilter),
      graphFilter: filterToPersisted(graphFilter),
      treePins,
      graphPins,
      searchQuery,
    })
  }, [treeFilter, graphFilter, treePins, graphPins, searchQuery])

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
      const pruned = new Set([...prev.selectedFiles].filter(f => allFiles.has(f)))
      if (pruned.size === prev.selectedFiles.size) return prev
      return { ...prev, selectedFiles: pruned }
    }
    setTreeFilter(prune)
    setGraphFilter(prune)
  }, [ast.definitions])

  // Focused-file auto-tracking (Tree only, preserves prior behavior).
  // When the editor's focused file changes, narrow the Tree to it — but
  // only when the Tree's files dimension is unpinned, since a pinned
  // user explicitly opted out of tracking.
  React.useEffect(() => {
    if (treePins.files) return
    if (ast.focusedFile) {
      setTreeFilter(prev => {
        const next = new Set([ast.focusedFile!])
        if (prev.selectedFiles.size === 1 && prev.selectedFiles.has(ast.focusedFile!)) return prev
        return { ...prev, selectedFiles: next }
      })
    }
  }, [ast.focusedFile, treePins.files])

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

    const { filter: newFilter, overriddenPins } = reconcileFilter(dest, source, destPins, transition)

    if (target === 'tree') {
      if (newFilter !== dest) setTreeFilter(newFilter)
      setTreeOverriddenPins(overriddenPins)
    } else {
      if (newFilter !== dest) setGraphFilter(newFilter)
      setGraphOverriddenPins(overriddenPins)
    }

    if (transition.kind === 'focus') {
      setPendingFocus({ name: transition.target.name, defType: transition.target.defType })
    }

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
      target: { name, defType, sourceFile: def?.sourceFile },
    })
  }, [ast.definitions, switchView])

  const showInTree = React.useCallback((name: string, defType: string) => {
    const def = ast.definitions.find(d => d.name === name && d.type === defType)
    switchView('tree', {
      kind: 'focus',
      target: { name, defType, sourceFile: def?.sourceFile },
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
    if (treeFilter.selectedFiles.size === 1 && onOpenFile) {
      onOpenFile(treeFilter.selectedFiles.values().next().value!)
    }
  }, [treeFilter.selectedFiles, onOpenFile])

  // Compose outer container className/style so consumers can layer overrides
  // without losing the built-in layout class.
  const shellClassName = className ? `view-shell ${className}` : 'view-shell'

  return (
    <DefinitionContext.Provider value={context}>
      <div className={shellClassName} style={style} onClick={onRefocus}>
        <div className="tab-bar">
          {!historyMode && (
            <button
              className={`tab-bar-btn ${activeView === 'tree' ? 'active' : ''}`}
              onClick={() => switchView('tree', { kind: 'manual' })}
            >
              Tree
            </button>
          )}
          <button
            className={`tab-bar-btn ${activeView === 'graph' ? 'active' : ''}`}
            onClick={() => switchView('graph', { kind: 'manual' })}
          >
            Graph
          </button>
        </div>

        {activeView === 'tree' ? (
          <TreeView
            ast={ast}
            onShowInGraph={showInGraph}
            filter={treeFilter}
            onFilterChange={setTreeFilter}
            pins={treePins}
            onPinsChange={setTreePins}
            searchQuery={searchQuery}
            searchActive={searchActive}
            onSearchChange={handleSearchChange}
            pendingFocus={pendingFocus}
            onFocusConsumed={clearPendingFocus}
            overriddenPins={treeOverriddenPins}
            onOverriddenPinsConsumed={clearTreeOverriddenPins}
          />
        ) : (
          <GraphView
            ast={ast}
            parserGraph={graphInput}
            onShowInTree={historyMode ? undefined : showInTree}
            filter={graphFilter}
            onFilterChange={setGraphFilter}
            pins={graphPins}
            onPinsChange={setGraphPins}
            searchQuery={searchQuery}
            searchActive={searchActive}
            onSearchChange={handleSearchChange}
            pendingFocus={pendingFocus}
            onFocusConsumed={clearPendingFocus}
            overriddenPins={graphOverriddenPins}
            onOverriddenPinsConsumed={clearGraphOverriddenPins}
          />
        )}
      </div>
    </DefinitionContext.Provider>
  )
}
