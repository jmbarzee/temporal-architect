import {
  selectionFor,
  initialFilter,
  filterFromJSON,
  filterToJSON,
  locksFromJSON,
  locksToJSON,
  TaxonomyContext,
  copyGroups,
  lockedFor,
  withSelection,
  GraphView,
  useLinkedViews,
  themeChoiceOf,
  useHostTheme,
  schemeVars,
  layoutFromJSON,
  layoutToJSON,
} from '@temporal-architect/graph-view'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import { useEditorTheme } from '../theme/useEditorTheme'
import { loadState, saveState, type StorageConfig } from '../adapter/storage'
import type {
  GraphNode,
  AxisLocks,
  LayoutState,
  ThemeChoice,
} from '@temporal-architect/graph-view'
import React from 'react'
import { DEFAULT_TAXONOMY } from '../adapter/node-types'
import './WorkflowCanvas.css'
import type { TWFFile, WorkflowDef, ActivityDef, WorkerDef, NamespaceDef, NexusServiceDef, SignalDecl, QueryDecl, UpdateDecl } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import { EMPTY_PARSER_GRAPH } from '../types/parser-graph'
import type { Decomposition } from '../types/decomposition'
import type { DecompositionParams } from './protocol'
import { TreeView, type TreeFocus } from './TreeView'
import { GroupsModal } from './GroupsModal'
import { ErrorBars } from './ErrorBars'
import { useGraphModel, definitionCounts } from '../adapter/useGraphModel'
import { initialGroupSelection, nodeGroupsOf, type GroupSelection, type GroupHover } from '../adapter/groups'

interface WorkflowCanvasProps {
  /** Parsed TWF AST to visualize. Produced by `twf parse` (the `definitions`
   * payload of the envelope) or constructed by a host application. The
   * tree view consumes this directly; the graph view's chip counts and
   * findings are read off it here. */
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


type ActiveView = 'tree' | 'graph'
const VIEWS: readonly ActiveView[] = ['tree', 'graph']

// A view switch as this host states it: a focus carries the target's name as
// well as its values, because the tree finds a definition by name. The library's
// `ViewTransition` takes any such transition, the name riding along unread.
type HostTransition = { kind: 'manual' } | { kind: 'focus'; target: TreeFocus }

// This host's persistence identity. It lives here, outside the §6.5 manifest,
// because a storage key naming a product and the global a webview caches its API
// on are host facts — the library owns the shape of what is persisted, not where.
const STORAGE: StorageConfig = {
  key: 'temporal-architect-visualizer-state',
  hostApiGlobal: '__twfVsCodeApi',
}

const DEFAULT_PINS: AxisLocks = new Map([
  [SOURCE_FILE_DIMENSION, false],
  [DEF_TYPE_DIMENSION, false],
])

export function WorkflowCanvas({ ast, parserGraph, decomposition, onOpenFile, onRefocus, onRequestDecomposition, className, style }: WorkflowCanvasProps) {
  const graphInput = parserGraph ?? EMPTY_PARSER_GRAPH
  // History mode: a graph-only payload (e.g. the sampler's observed graph) has
  // no AST definitions. The Tree view has nothing to render, so we hide its tab
  // and default to the Graph view.
  const historyMode = ast.definitions.length === 0
  // Load persisted state once on mount. A filter reads back through the
  // library's `filterFromJSON`, which refuses a stored value that is not a
  // filter, and the view then starts from its default; a stale shape never gets
  // that far — the version guard in storage.ts discards it.
  const persisted = React.useMemo(() => loadState(STORAGE), [])

  // Keep-alive: the Graph view is mounted lazily (the first time it's shown)
  // and then kept mounted — hidden, not unmounted — when the user switches
  // away, so its viewport/layout survive a round-trip to the Tree view. We
  // mount it lazily rather than on first render so its one-shot initial fit
  // happens while it's visible (a hidden 0×0 container would fit to nothing).
  const [graphEverShown, setGraphEverShown] = React.useState(historyMode)

  // The Graph view's inputs, read here off the payload: the graph built from
  // the parser's deployment graph, the findings, the chip counts. The
  // view builds none of them and never sees the AST or the parser graph. Read
  // before the filters below: the filter a view starts from is the library's
  // default over this graph, narrowed to the focused file when there is one.
  const model = useGraphModel(ast, graphInput)
  const startingFilter = () => withSelection(
    initialFilter(DEFAULT_TAXONOMY, model.graph),
    SOURCE_FILE_DIMENSION,
    ast.focusedFile ? new Set([ast.focusedFile]) : new Set<string>(),
  )

  // Each view's filter, locks and shown axes, the view shown, the search they
  // share, and what a switch between the two does to them, live in the
  // library's `useLinkedViews`. A view starts from its persisted state, else
  // the default filter (narrowed to the focused file), the default locks and —
  // the hook's default — every declared axis in the host's declared order, so
  // "default displayed filters" is configurable by declaring a different
  // taxonomy rather than by a setting. The Graph is shown first
  // when there is no Tree to show.
  const linked = useLinkedViews({
    taxonomy: DEFAULT_TAXONOMY,
    views: VIEWS,
    graph: model.graph,
    start: historyMode ? 'graph' : 'tree',
    initialSearch: { query: persisted.searchQuery ?? '', active: false },
    initial: view => {
      const saved = view === 'tree'
        ? { filter: persisted.treeFilter, locks: persisted.treePins, axes: persisted.treeChain }
        : { filter: persisted.graphFilter, locks: persisted.graphPins, axes: persisted.graphChain }
      return { filter: filterFromJSON(saved.filter) ?? startingFilter(), locks: locksFromJSON(saved.locks) ?? DEFAULT_PINS, axes: saved.axes }
    },
  })
  const { switchTo, focus, updateFilter, updateFilters } = linked
  const activeView = linked.active
  const treeFilter = linked.state.tree.filter
  const graphFilter = linked.state.graph.filter

  const graphCounts = React.useMemo(() => definitionCounts(ast, selectionFor(graphFilter, SOURCE_FILE_DIMENSION)), [ast, graphFilter])

  // The group overlay's selection and hover preview (GRAPH_VIEW.md
  // § Decomposition Group Overlay) are the host's: what a group is comes from
  // its decomposition, and the view draws what it is handed. Both reset when
  // a new decomposition arrives.
  const [groupSelection, setGroupSelection] = React.useState<GroupSelection>(() => initialGroupSelection(decomposition))
  const [groupHover, setGroupHover] = React.useState<GroupHover | null>(null)
  React.useEffect(() => {
    setGroupSelection(initialGroupSelection(decomposition))
    setGroupHover(null)
  }, [decomposition])
  // Every node's deployment copies by their shared key, derived from the graph
  //; the group overlay maps a decomposition's members through it.
  const copies = React.useMemo(() => copyGroups(model.graph), [model.graph])
  const nodeGroups = React.useMemo(
    () => nodeGroupsOf(decomposition, groupSelection, groupHover, copies),
    [decomposition, groupSelection, groupHover, copies],
  )

  // The search is one query applied identically to both views (spec § Search
  // Scope), held by the hook — started from the persisted query — and handed
  // to each view in `linked.of(view)`. Search is non-destructive (dim, not
  // hide), so sharing is safe.
  const [graphTheme, setGraphTheme] = React.useState<ThemeChoice>(() => themeChoiceOf(persisted.graphTheme))
  // The host's theme for the whole canvas, and the scheme in it, carried as
  // custom properties on the root so every chip and token — the tree's too —
  // reads the taxonomy's colours, not a mounted stylesheet. The graph
  // pane overrides both with its own choice.
  const rootRef = React.useRef<HTMLDivElement>(null)
  // The editor's theme when this runs as a webview, else whatever an ancestor
  // declares or the OS prefers; set on the root as `data-theme`, the one
  // signal the library reads.
  const editorTheme = useEditorTheme()
  const detectedTheme = useHostTheme(rootRef)
  const hostTheme = editorTheme ?? detectedTheme
  const schemeStyle = React.useMemo(() => schemeVars(DEFAULT_TAXONOMY, hostTheme) as React.CSSProperties, [hostTheme])

  // The Graph pane's layout — the force tuning and the node scale. The pane
  // starts from the persisted one (built once) and keeps its own; the host
  // holds what it reports, for persistence. Until the pane reports, a stored
  // layout stays the one persisted, so a session that never shows the Graph
  // does not drop it.
  const defaultLayout = React.useMemo(() => layoutFromJSON(persisted.graphLayout ?? {}, DEFAULT_TAXONOMY), [persisted])
  const [layout, setLayout] = React.useState<LayoutState | undefined>(persisted.graphLayout === undefined ? undefined : defaultLayout)

  // Pending-focus target for a focus into the Tree. The hook has already
  // expanded the Tree's filter by the time this is set; the Tree consumes it
  // for scroll/flash only, and its bar flashes any lock the focus overrode.
  // (A focus into the Graph is `linked.focus`: the view does its own
  // reconcile, flashes its own locks and centres on the node.)
  const [pendingFocus, setPendingFocus] = React.useState<TreeFocus | null>(null)

  // Persist on every relevant state change. localStorage in standalone;
  // vscode.setState in webview (via the storage shim).
  React.useEffect(() => {
    const { tree, graph } = linked.state
    saveState(STORAGE, {
      treeFilter: filterToJSON(tree.filter),
      graphFilter: filterToJSON(graph.filter),
      treeChain: [...tree.axes],
      graphChain: [...graph.axes],
      treePins: locksToJSON(tree.locks),
      graphPins: locksToJSON(graph.locks),
      searchQuery: linked.search.query,
      graphTheme,
      ...(layout ? { graphLayout: layoutToJSON(layout) } : {}),
    })
  }, [linked.state, linked.search.query, graphTheme, layout])

  // Stale file cleanup: when the AST changes, remove any selectedFiles
  // entries that no longer exist in either view. Pins are not touched —
  // a user who pinned the files axis still has the axis pinned
  // even if its contents shrink to empty.
  React.useEffect(() => {
    const allFiles = new Set<string>()
    for (const def of ast.definitions) {
      if (def.sourceFile) allFiles.add(def.sourceFile)
    }
    updateFilters(filter => {
      const pruned = new Set([...selectionFor(filter, SOURCE_FILE_DIMENSION)].filter(f => allFiles.has(f)))
      if (pruned.size === selectionFor(filter, SOURCE_FILE_DIMENSION).size) return filter
      return withSelection(filter, SOURCE_FILE_DIMENSION, pruned)
    })
  }, [ast.definitions, updateFilters])

  // Focused-file auto-tracking (Tree only, preserves prior behavior).
  // When the editor's focused file changes, narrow the Tree to it — but
  // only when the Tree's files axis is unpinned, since a pinned
  // user explicitly opted out of tracking.
  const treeFilePinned = lockedFor(linked.state.tree.locks, SOURCE_FILE_DIMENSION)
  const treeShowsFiles = linked.state.tree.axes.includes(SOURCE_FILE_DIMENSION)
  React.useEffect(() => {
    if (treeFilePinned) return
    // Do not repopulate an axis the Tree has removed — same reason a switch
    // reconciles only the axes the destination shows.
    if (!treeShowsFiles) return
    const focused = ast.focusedFile
    if (!focused) return
    updateFilter('tree', filter => withSelection(filter, SOURCE_FILE_DIMENSION, new Set([focused])))
    // Depends on the file axis's pin, NOT the whole AxisLocks. Widening it to
    // the Map when pins became Maps meant pinning the KIND axis produced a new
    // Map, re-ran this effect, and silently reset the Tree's file selection to
    // the focused file.
  }, [ast.focusedFile, treeFilePinned, treeShowsFiles, updateFilter])

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
  const switchView = React.useCallback((target: ActiveView, transition: HostTransition) => {
    // History mode has no Tree view; never switch to it (defensive — the
    // Tree tab button and "Show in Tree" affordances are hidden anyway).
    if (target === 'tree' && historyMode) return
    // Same-view manual click is a no-op; same-view focus is impossible
    // by construction (Show in [view] is always cross-view).
    if (target === activeView && transition.kind === 'manual') return

    // A focus into the Graph: the hook switches to it and hands the view a
    // request, which reconciles its own filter, flashes any lock it overrides
    // and centres on the node. A target with no node in the graph is a manual
    // switch.
    if (target === 'graph' && transition.kind === 'focus') {
      const { name, values } = transition.target
      const node = model.graph.nodes.find(n =>
        n.name === name && n.values[DEF_TYPE_DIMENSION] === values[DEF_TYPE_DIMENSION])
      if (node) focus('graph', node)
      else switchTo('graph')
      setGraphEverShown(true)
      return
    }

    // Into the Tree, manual or focus: the hook reconciles the Tree's filter on
    // the axes the Tree shows, and the locks a focus overrode reach the Tree's
    // bar, which flashes them. Into the Graph (manual only, from here): the
    // Graph adopts the Tree's selections except where it is locked.
    if (target === 'tree') {
      switchTo('tree', transition)
      if (transition.kind === 'focus') setPendingFocus(transition.target)
    } else {
      switchTo('graph')
      setGraphEverShown(true)
    }
  }, [activeView, historyMode, model.graph, switchTo, focus])

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

  const showInTree = React.useCallback((node: GraphNode) => {
    const name = node.name
    const defType = node.values[DEF_TYPE_DIMENSION] ?? ''
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
    <TaxonomyContext.Provider value={DEFAULT_TAXONOMY}>
    <DefinitionContext.Provider value={context}>
      <div className={shellClassName} style={{ ...schemeStyle, ...(style) }} onClick={onRefocus} ref={rootRef} data-theme={hostTheme}>
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
              {...linked.of('tree')}
              systemTheme={hostTheme}
              pendingFocus={pendingFocus}
              onFocusConsumed={clearPendingFocus}
            />
          </div>
        )}
        {graphEverShown && (
          <div className={`view-pane${activeView === 'graph' ? '' : ' hidden'}`}>
            <GraphView
              keyboard={activeView === 'graph' ? 'global' : 'none'}
              graph={model.graph}
              counts={graphCounts}
              findings={<ErrorBars errors={model.errors} diagnostics={model.diagnostics} selectedFiles={selectionFor(graphFilter, SOURCE_FILE_DIMENSION)} />}
              groups={nodeGroups}
              groupsControl={active => (
                <GroupsModal
                  decomposition={decomposition}
                  selection={groupSelection}
                  onSelectionChange={setGroupSelection}
                  hover={groupHover}
                  onHover={setGroupHover}
                  activeGroups={active}
                  onRequestDecomposition={onRequestDecomposition}
                />
              )}
              nodeAction={historyMode ? undefined : { label: 'Show in Tree', onSelect: showInTree }}
              theme={graphTheme}
              onThemeChange={setGraphTheme}
              systemTheme={hostTheme}
              defaultLayout={defaultLayout}
              onLayoutChange={setLayout}
              {...linked.of('graph')}
            />
          </div>
        )}
      </div>
    </DefinitionContext.Provider>
    </TaxonomyContext.Provider>
  )
}
