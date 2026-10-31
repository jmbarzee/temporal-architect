// Graph View: a force-directed graph, filtered, highlighted and tuned.
// Wires together validation, simulation, viewport, rendering and interaction.

import React from 'react'
import './GraphView.css'
import { readableGraph, isContainment, withContainmentEdges } from '../graph/model'
import type { Graph, GraphEdge, GraphNode } from '../graph/model'
import type { FilterState, PinState } from '../filter/types'
import { defaultFilter, passesSelection } from '../filter/types'
import { reconcileFilter } from '../filter/reconcile'
import type { Simulation } from '../graph/simulation'
import { bandOverlay, layoutFrame, resolvePhysics } from '../graph/forces'
import { countsOn, isIdentityMapping, valuesOn } from '../graph/dimension'
import type { DimensionalMapping } from '../graph/dimension'
import type { PresentSets } from './graph-view/present'
import { presentSetsOf } from './graph-view/present'
import type { EdgeStroke, Theme } from '../graph/scheme'
import { schemeVars } from '../graph/scheme'
import { useTheme, THEME_CHOICES } from './graph-view/useTheme'
import type { ThemeChoice } from './graph-view/useTheme'
import { axisOptions, layoutAxisOptions, pairTuning, sprungEdges } from '../graph/simulation'
import { copyGroups, copyKeyOf } from '../graph/model'
import { DEFAULT_NODE_SCALE, type NodeScaleParams } from '../graph/node-scale'
import { OntologyContext, useOntology } from './graph-view/useOntology'
import type { Ontology } from '../graph/ontology'
import { worldToScreen } from '../graph/viewport'
import type { Viewport } from '../graph/viewport'
import { zoomAt } from '../graph/viewport'
import { GraphCanvas } from './GraphCanvas'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'
import { GraphControlPanel } from './GraphControlPanel'
import { activeGroupsOf, boostGroupsForNodes, type ActiveGroup, type NodeGroup } from '../graph/groups'
import { FilterBar } from './FilterBar'
import type { SearchState } from './FilterBar'
export type { SearchState } from './FilterBar'
import { useRecentlyChanged } from './graph-view/useRecentlyChanged'
import { useViewport } from './graph-view/useViewport'
import { useHighlight } from './graph-view/useHighlight'
import { useSimulation } from './graph-view/useSimulation'
import { useVisibleGraph } from './graph-view/useVisibleGraph'
import { useSimulationLoop } from './graph-view/useSimulationLoop'
import { useControllable, useLatest } from './graph-view/useControllable'
import { validateGraph, dropInvalid } from '../graph/validate'
import type { GraphDiagnostic } from '../graph/validate'

/** A node's position in the layout, in world units. */
export interface Position { x: number; y: number }

/**
 * What a host may ask of a mounted view. `focusNode` is the whole focus
 * recipe in one call: widen the filter just enough on the axes shown
 * (overriding a pin, which flashes), centre on the node once the layout has
 * settled, and select it.
 */
export interface GraphViewHandle {
  /** Reveal, centre and select a node by id. False when the id is not in the graph. */
  focusNode(id: string): boolean
  /** Frame the visible nodes. */
  fit(): void
  /** Every node's position, by id — a layout the host may keep and hand back as `positions`. */
  getPositions(): Map<string, Position>
  /** Move nodes to the given positions (pinned ones stay) and let the layout settle around them. */
  setPositions(positions: ReadonlyMap<string, Position>): void
}

/**
 * The view's inputs. Only `graph` is required, with a taxonomy from either the
 * `ontology` prop or an `OntologyContext.Provider` above. Every piece of state
 * follows the React convention: pass the value and its callback to control it,
 * or neither and the view keeps it; a callback alone still reports changes.
 */
export interface GraphViewProps {
  /** The graph, built by the host from whatever it reads. Keep one object until its nodes or edges change. */
  graph: Graph
  /** The taxonomy, when not supplied through `OntologyContext`. */
  ontology?: Ontology
  /**
   * Where the pane's shortcuts listen. `pane` (the default): the root is
   * focusable and handles the keys that reach it, so a host page keeps Tab
   * and Space for its own controls. `global`: the window — for a host whose
   * whole page is this pane, or a tab shell's active tab. `none`: no
   * shortcuts — a tab shell's hidden tab.
   */
  keyboard?: 'pane' | 'global' | 'none'
  /** Where nodes start, by id — a layout the host kept (`getPositions`). Read when the simulation is built. */
  positions?: ReadonlyMap<string, Position>
  /** Chip badge counts per axis and value — the host's reading of its own data. Absent, the graph's node counts. */
  counts?: ReadonlyMap<string, ReadonlyMap<string, number>>
  /** The host's findings bars, rendered under the filter chips. */
  findings?: React.ReactNode
  /** Groups to glow, over the whole graph; the view restricts them to the visible set and colours them. */
  groups?: readonly NodeGroup[]
  /** The host's control for its groups (a legend, a modal), rendered inside the pane — which sets `--gv-toolbar-height` on its root so a control can anchor under the bar — and handed the groups as drawn, colours included. */
  groupsControl?: (active: readonly ActiveGroup[]) => React.ReactNode
  /** The host's action for a node — its label, and what it does with the node — offered in the hover box. */
  crossView?: { label: string; onFocus: (node: GraphNode) => void }
  /** Whether the control panel (the forces, the node scale) is offered. Default true. */
  controls?: boolean
  /** Whether the Auto / Light / Dark button is offered. Default true. */
  themeToggle?: boolean
  /** Added to the root's class list; the root keeps its own. */
  className?: string
  /** Merged onto the root's style; the scheme's variables stay. */
  style?: React.CSSProperties

  /** The selection per axis. Default: `defaultFilter(ontology, graph)`, seeded once. */
  filter?: FilterState
  onFilterChange?: (next: FilterState) => void
  /** Which axes are pinned against a cross-view adoption. Default: none. */
  pins?: PinState
  onPinsChange?: (next: PinState) => void
  /** The axes shown, in order. Default: every declared filter axis. Editable in the bar unless controlled without a callback. */
  chain?: readonly string[]
  onChainChange?: (next: readonly string[]) => void
  /** The search control. Default: closed and empty. */
  search?: SearchState
  onSearchChange?: (next: SearchState) => void
  /** The pane's theme choice. Default: `system`. */
  theme?: ThemeChoice
  onThemeChange?: (next: ThemeChoice) => void

  /** The selected node, or null when the selection clears. */
  onSelectionChange?: (node: GraphNode | null) => void
  /** A node double-clicked. */
  onNodeActivate?: (node: GraphNode) => void
  /** The node under the pointer, or null. */
  onHover?: (node: GraphNode | null) => void
  /** The theme the pane resolved to draw in — the choice, or the host's for `system`. */
  onThemeResolved?: (theme: Theme) => void
}

const NO_FLASH: ReadonlySet<string> = new Set()

// A layout effect where there is a layout: on a server render there is none,
// and React says so on the console for every `useLayoutEffect` it meets.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

export const GraphView = React.forwardRef<GraphViewHandle, GraphViewProps>(function GraphView({
  graph: hostGraph,
  ontology: ontologyProp,
  keyboard = 'pane',
  positions,
  counts: hostCounts,
  findings,
  groups,
  groupsControl,
  crossView,
  controls = true,
  themeToggle = true,
  className,
  style,
  filter: filterProp, onFilterChange,
  pins: pinsProp, onPinsChange,
  chain: hostChain, onChainChange,
  search: searchProp, onSearchChange,
  theme: themeProp, onThemeChange,
  onSelectionChange, onNodeActivate, onHover, onThemeResolved,
}: GraphViewProps, ref) {
  // The taxonomy: the prop, or the context. Neither is a wiring bug a
  // default would hide, so it is said here, once, before any hook.
  const fromContext = React.useContext(OntologyContext)
  const ontology = ontologyProp ?? fromContext
  if (!ontology) {
    throw new Error('GraphView has no taxonomy: pass `ontology`, or mount it inside <OntologyContext.Provider value={…}>.')
  }
  // State the host may control or leave to the view: the filter, the pins,
  // the chain of axes shown, the search control, the theme choice.
  const [filter, setFilter] = useControllable(filterProp, onFilterChange, () => defaultFilter(ontology, hostGraph))
  const [pins, setPins] = useControllable(pinsProp, onPinsChange, () => new Map<string, boolean>())
  const [chain, setChain] = useControllable(hostChain, onChainChange, () => ontology.filterDimensions.map(d => d.id))
  const chainEditable = hostChain === undefined || onChainChange !== undefined
  const [search, setSearch] = useControllable(searchProp, onSearchChange, () => ({ query: '', active: false }))
  const [themeChoice, setThemeChoice] = useControllable(themeProp, onThemeChange, () => 'system' as ThemeChoice)
  const searchQuery = search.query
  const searchActive = search.active
  // The axes this view filters on are the chain's, in order: an axis the host
  // declared but this view does not show is not filtering here.
  const filterAxes = React.useMemo(
    () => chain.flatMap(id => { const d = ontology.descriptorFor(id); return d ? [d] : [] }),
    [chain, ontology],
  )
  // The host's graph, checked once: every defect named, the edges an
  // error names left out of what is drawn, the list shown under the bar.
  const diagnostics = React.useMemo(() => validateGraph(hostGraph, ontology), [hostGraph, ontology])
  // What is drawn: the host's graph less what an error names, plus the
  // containment edge each `parentId` implies where the host listed none.
  const graph = React.useMemo(() => withContainmentEdges(dropInvalid(hostGraph, diagnostics)), [hostGraph, diagnostics])
  // The chip badges: the host's reading of its own data, or a count of the
  // graph's nodes per axis and value.
  const nodeCounts = React.useMemo(() => countsOn(graph.nodes.values(), chain), [graph, chain])
  const counts = hostCounts ?? nodeCounts
  // Every node's copies, by the key they share — derived here, once per graph.
  const copies = React.useMemo(() => copyGroups(graph), [graph])

  // --- Core state ---
  // Camera (viewport transform, container ref, fit/center coordination).
  const { viewport, setViewport, containerRef, initialFitDone, pendingCenterRef, fit } = useViewport()
  // The simulation instance + its handlers are owned by useSimulation, and the
  // RAF loop + fps by useSimulationLoop, both called below once `graph` and the
  // visible subgraph are available.

  // Interaction / highlight state (hover, selection, keyboard focus, shift, and
  // the control-panel preview) is owned by useHighlight, called below once the
  // visible subgraph it derives from is available.

  // --- Search ---
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

  // The overlay (filter chips, search, the host's findings, the pane's
  // diagnostics, the search results) floats over the full-bleed canvas, and
  // its height is dynamic. It is measured whole, so a host control anchored
  // at `--gv-toolbar-height` sits under everything the overlay shows, the open
  // search results included.
  const toolbarRef = React.useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = React.useState(0)
  useIsomorphicLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => setToolbarHeight(el.getBoundingClientRect().height)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const recentlyChanged = useRecentlyChanged(filter)

  // What each filter axis can take, read off the graph: the engine declares no
  // value vocabulary, so the bar learns an axis's domain from the nodes.
  const valuesByDimension = React.useMemo(
    () => new Map(ontology.filterDimensions.map(d => [d.id, valuesOn(graph.nodes.values(), d.id)])),
    [graph, ontology],
  )

  // Reset camera/fps coordination on each sim rebuild. Held by useSimulation
  // and invoked from its build effect (selection reset is owned by useHighlight,
  // keyed on `graph`).
  // The camera refits after the first build only: a rebuild that carried the
  // layout over keeps the user's pan and zoom.
  const onSimRebuild = React.useCallback((continued: boolean) => {
    if (!continued) initialFitDone.current = false
  }, [initialFitDone])

  // Simulation spine: the instance, version signal, running flag, forceParams,
  // and every sim-mutating handler.
  const {
    simRef,
    simVersion,
    running, setRunning,
    forceParams,
    getNode: getSimNode,
    onParamChange: handleParamChange,
    onForceAdjust: handleForceAdjust,
    onRelayout: handleRelayout,
    onNodeDragStart: handleNodeDragStart,
    onNodeDragMove: handleNodeDragMove,
    onNodeDragEnd: handleNodeDragEnd,
    onToggleRunning: handleToggleRunning,
  } = useSimulation(graph, ontology, positions, onSimRebuild)


  // The dense per-bucket tables the kernels read, resolved once per
  // (params, taxonomy) here and handed to the canvas and every control.
  const resolved = React.useMemo(() => resolvePhysics(forceParams, ontology), [forceParams, ontology])

  // What the push/pull tab offers: every axis this graph admits with its
  // measured token cost, and the spring categories some edge falls in under
  // the current one (the pull tokens). Both read the whole graph, not the
  // visible subset — tuning covers what a filter may reveal next.
  const axes = React.useMemo(() => axisOptions(ontology, graph), [ontology, graph])
  const layoutAxes = React.useMemo(() => layoutAxisOptions(axes, ontology), [axes, ontology])
  // The frame the band forces act in and the overlay the canvas draws, both
  // over the WHOLE graph — the same frame the simulation seeds and ticks in.
  const frame = React.useMemo(() => layoutFrame(readableGraph(graph), resolved), [graph, resolved])
  // The theme the pane draws in: the choice, or the host's for system. The
  // scheme rides inline as custom properties in that theme, and every
  // visible edge's stroke is resolved here once, not per frame.
  const theme = useTheme(containerRef, themeChoice)
  const schemeStyle = React.useMemo(() => schemeVars(ontology, theme) as React.CSSProperties, [ontology, theme])
  const overlay = React.useMemo(() => bandOverlay(graph.nodes.values(), forceParams, resolved, frame,
    (axis, bucket) => axis.mapping.dimension === ontology.styleAxis() && isIdentityMapping(axis.mapping)
      ? ontology.styleOf(bucket).color[theme].fill
      : undefined), [graph, forceParams, resolved, frame, ontology, theme])

  // A new axis starts both pair forces from the taxonomy's declared physics on
  // its buckets (a tuning keyed by one axis has no reading on another).
  const handleAxisChange = React.useCallback((mapping: DimensionalMapping) => {
    if (mapping.dimension === forceParams.pair.mapping.dimension) return
    handleRelayout({ pair: pairTuning(mapping) })
  }, [forceParams.pair.mapping.dimension, handleRelayout])

  // Render-time node sizing (independent of the simulation). Tunable from the
  // Controls panel (Misc → Node scaling); a pure-render concern, so it doesn't
  // touch ForceParams or reheat the layout.
  const [nodeScale, setNodeScale] = React.useState<NodeScaleParams>(DEFAULT_NODE_SCALE)
  const handleNodeScaleChange = React.useCallback((patch: Partial<NodeScaleParams>) => {
    setNodeScale(prev => ({ ...prev, ...patch }))
  }, [])

  // The pins a focus overrode flash once, for 600 ms, then clear. The view's
  // own state: a host never sees it.
  const [flashPins, setFlashPins] = React.useState<ReadonlySet<string>>(NO_FLASH)
  React.useEffect(() => {
    if (flashPins.size === 0) return
    const timer = setTimeout(() => setFlashPins(NO_FLASH), 600)
    return () => clearTimeout(timer)
  }, [flashPins])

  // Stale-file cleanup is now owned by the host shell (it touches both views'
  // filters consistently when the AST changes).

  // Visible subgraph derived from the live sim (filter + edge graduation +
  // summaries + downstream-depth scores), recomputed on filter / sim-rebuild.
  const { visibleNodes, visibleEdges, visibleIds, edgeTypes, nodeSummaries, downstreamScores } =
    useVisibleGraph(simRef, simVersion, filter, filterAxes, ontology)

  // Every visible edge's stroke, from the type the derivation resolved on the
  // edge's ORIGINAL endpoints, once, not per frame. An edge
  // whose type the taxonomy does not declare has no entry and draws neutral;
  // `validateGraph` has already named it.
  const edgeStrokes = React.useMemo(() => {
    const strokes = new Map<GraphEdge, EdgeStroke>()
    for (const edge of visibleEdges) {
      const type = edgeTypes.get(edge.id)
      if (type !== undefined) strokes.set(edge, ontology.edgeStrokeFor(type))
    }
    return strokes
  }, [visibleEdges, edgeTypes, ontology])

  // Parallel dependency edges — two or more between one pair of visible nodes,
  // kept apart — take lanes a few pixels either side of the line so
  // both read. One pass per visible set.
  const edgeOffsets = React.useMemo(() => {
    const byPair = new Map<string, string[]>()
    for (const e of visibleEdges) {
      if (isContainment(e)) continue
      const key = e.sourceId < e.targetId ? `${e.sourceId}|${e.targetId}` : `${e.targetId}|${e.sourceId}`
      const list = byPair.get(key)
      if (list) list.push(e.id); else byPair.set(key, [e.id])
    }
    const out = new Map<string, number>()
    for (const ids of byPair.values()) {
      if (ids.length < 2) continue
      ids.forEach((id, i) => out.set(id, (i - (ids.length - 1) / 2) * 7))
    }
    return out
  }, [visibleEdges])

  // What the controls offer: only what the post-filter visible set holds —
  // one function, `presentSetsOf`, that the harness calls too.
  // The pull half is read over the edges the simulation springs (the graph's
  // own, both ends visible), not over the graduated edges it draws.
  const sprung = React.useMemo(() => sprungEdges(graph.edges, visibleIds), [graph, visibleIds])
  const present = React.useMemo<PresentSets>(
    () => presentSetsOf(visibleNodes, sprung, resolved, getSimNode),
    [visibleNodes, sprung, resolved, ontology, getSimNode],
  )

  // Selection / hover / keyboard-focus / shift + control-panel preview state,
  // plus the derived transitive-dependency highlight sets and focusedNodeId.
  const {
    hoveredNodeId, setHoveredNodeId,
    selectedNodeId, setSelectedNodeId,
    setFocusedIndex,
    shiftHeld,
    focusedNodeId,
    highlightedNodes, highlightedEdges,
    activeSection, setActiveSection,
    activePushBucket, setActivePushBucket,
    activeGravityBucket, setActiveGravityBucket,
    activePullEdge, setActivePullEdge,
  } = useHighlight(visibleNodes, visibleEdges, visibleIds, getSimNode, graph, ontology)

  // The groups as drawn: the
  // host's, restricted to the visible set and coloured in order. Drives the
  // canvas glow and the host's control.
  const activeGroups = React.useMemo(() => activeGroupsOf(groups ?? [], visibleIds, theme), [groups, visibleIds, theme])

  // Canvas glow set: the active groups with the group under the hovered/selected
  // node strengthened, so one group surfaces from many faint ones as the pointer
  // moves. The modal keeps the un-boosted activeGroups (its legend colors don't
  // depend on strength).
  const glowGroups = React.useMemo(
    () => boostGroupsForNodes(activeGroups, [hoveredNodeId, selectedNodeId]),
    [activeGroups, hoveredNodeId, selectedNodeId],
  )

  // Search matches against all nodes (not just visible). When search is
  // active we return a Set even if empty so the canvas dims everything —
  // an empty search with a query is "no matches yet, all non-matching",
  // not "no search active".
  // Hidden matches are counted on the chip hiding them: the first declared
  // axis the node fails, under its value there — a precedence a host's own
  // filter bar can share, so the two read alike.
  const { visibleMatchIds, hiddenMatchCount, hiddenMatches } = React.useMemo(() => {
    const none = new Map<string, ReadonlyMap<string, number>>()
    if (!searchQuery) return { visibleMatchIds: null as Set<string> | null, hiddenMatchCount: 0, hiddenMatches: none }
    const lq = searchQuery.toLowerCase()
    const sim = simRef.current
    if (!sim) return { visibleMatchIds: new Set<string>(), hiddenMatchCount: 0, hiddenMatches: none }

    const visible = new Set<string>()
    let hidden = 0
    const byAxis = new Map<string, Map<string, number>>()
    for (const node of sim.nodes) {
      if (!ontology.searchText(node).toLowerCase().includes(lq)) continue
      if (visibleIds.has(node.id)) { visible.add(node.id); continue }
      hidden++
      const failing = filterAxes.find(d => !passesSelection(filter, [d], dim => ontology.valueOn(node, dim)))
      const value = failing ? ontology.valueOn(node, failing.id) : undefined
      if (!failing || value === undefined) continue
      const tally = byAxis.get(failing.id) ?? new Map<string, number>()
      tally.set(value, (tally.get(value) ?? 0) + 1)
      byAxis.set(failing.id, tally)
    }
    return { visibleMatchIds: visible, hiddenMatchCount: hidden, hiddenMatches: byAxis }
  }, [searchQuery, visibleIds, filter, filterAxes, ontology])

  // Physics loop + filter-driven reheats. Owns the RAF tick (with one-shot
  // initial fit, cross-view center, fps, and stability stop), the hover tooltip
  // re-render tick, and the seed/reheat-on-filter-change effects. It consumes the
  // sim, the visible subgraph, and the camera/selection handles as inputs.
  const { fps } = useSimulationLoop({
    simRef, running, setRunning,
    visibleIds, visibleNodes, downstreamScores,
    filter, axes: filterAxes,
    hoveredNodeId, selectedNodeId,
    containerRef, initialFitDone, pendingCenterRef, setViewport, setSelectedNodeId, ontology,
  })

  // What the host hears: the selection, the hover, a double-click and the
  // resolved theme. Read through refs, so a host passing a fresh function
  // each render is not re-notified of an unchanged value.
  const onSelectionChangeRef = useLatest(onSelectionChange)
  const onHoverRef = useLatest(onHover)
  const onNodeActivateRef = useLatest(onNodeActivate)
  const onThemeResolvedRef = useLatest(onThemeResolved)
  React.useEffect(() => {
    onSelectionChangeRef.current?.(selectedNodeId === null ? null : graph.nodes.get(selectedNodeId) ?? null)
  }, [selectedNodeId]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    onHoverRef.current?.(hoveredNodeId === null ? null : graph.nodes.get(hoveredNodeId) ?? null)
  }, [hoveredNodeId]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { onThemeResolvedRef.current?.(theme) }, [theme]) // eslint-disable-line react-hooks/exhaustive-deps

  // Double-click node: center and zoom to neighbors, and tell the host.
  const handleDoubleClickNode = React.useCallback((id: string) => {
    const sim = simRef.current
    if (!sim) return
    const node = sim.getNode(id)
    if (!node) return
    const hostNode = graph.nodes.get(id)
    if (hostNode) onNodeActivateRef.current?.(hostNode)
    const neighborIds = new Set<string>([id])
    for (const edge of sim.edges) {
      if (edge.sourceId === id) neighborIds.add(edge.targetId)
      if (edge.targetId === id) neighborIds.add(edge.sourceId)
    }
    const neighbors = sim.nodes.filter(n => neighborIds.has(n.id))
    fit(neighbors, 80)
  }, [fit, graph])

  // Fit-to-view
  const handleFitToView = React.useCallback(() => {
    fit(visibleNodes)
  }, [fit, visibleNodes])

  // Search toggle — used by the keyboard handler (Escape closes search). The
  // filter-bar's own search button has its own copy inside FilterBar. Search
  // query is globally shared so clearing it on close affects both views.
  const toggleSearch = () => {
    if (searchActive) {
      setSearch({ query: '', active: false })
    } else {
      setSearch({ query: searchQuery, active: true })
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  // Hover with a grace period so the pointer can travel from a node onto its
  // hover tooltip (interactive — it carries the host's cross-view button)
  // without the tooltip vanishing. A null from the canvas schedules a clear;
  // the tooltip's onMouseEnter cancels it, onMouseLeave re-arms it.
  const hoverClearTimer = React.useRef<number | null>(null)
  const cancelHoverClear = React.useCallback(() => {
    if (hoverClearTimer.current !== null) {
      clearTimeout(hoverClearTimer.current)
      hoverClearTimer.current = null
    }
  }, [])
  const handleHoverNode = React.useCallback((id: string | null) => {
    cancelHoverClear()
    if (id !== null) {
      setHoveredNodeId(id)
    } else {
      hoverClearTimer.current = window.setTimeout(() => {
        setHoveredNodeId(null)
        hoverClearTimer.current = null
      }, 150)
    }
  }, [cancelHoverClear, setHoveredNodeId])

  // Select node from search result
  const handleSelectSearchResult = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    // Center viewport on the node
    const sim = simRef.current
    const container = containerRef.current
    if (!sim || !container) return
    const node = sim.getNode(nodeId)
    if (!node) return
    const { width, height } = container.getBoundingClientRect()
    setViewport({
      scale: viewport.scale,
      x: width / 2 - node.x * viewport.scale,
      y: height / 2 - node.y * viewport.scale,
    })
  }

  // What a host may ask of the mounted view. `focusNode` is the whole focus
  // recipe: widen the filter just enough on the axes shown (a pin it
  // overrides flashes), then centre on and select the node once the layout
  // has settled — the loop consumes the request after its warm-up.
  const visibleNodesRef = useLatest(visibleNodes)
  React.useImperativeHandle(ref, () => ({
    focusNode: (id: string) => {
      const node = graph.nodes.get(id)
      if (!node) return false
      const target = { name: node.name, values: node.dimensions }
      const result = reconcileFilter(filter, filter, pins, { kind: 'focus', target }, filterAxes)
      if (result.filter !== filter) setFilter(result.filter)
      if (result.overriddenPins.size > 0) setFlashPins(result.overriddenPins)
      pendingCenterRef.current = { nodeId: id }
      if (!running) {
        simRef.current?.reheat(0.1)
        setRunning(true)
      }
      return true
    },
    fit: () => fit(visibleNodesRef.current),
    getPositions: () => new Map((simRef.current?.nodes ?? []).map(n => [n.id, { x: n.x, y: n.y }])),
    setPositions: (next: ReadonlyMap<string, Position>) => {
      const sim = simRef.current
      if (!sim) return
      for (const [id, p] of next) {
        const n = sim.getNode(id)
        if (!n || n.pinned) continue
        n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0
      }
      sim.reheat(0.1)
      setRunning(true)
    },
  }), [graph, filter, pins, filterAxes, setFilter, running, fit, setRunning, simRef, pendingCenterRef, visibleNodesRef])

  // Keyboard, scoped by `keyboard`: on the pane, the focusable root
  // handles the keys that reach it; globally, the window does — a tab shell
  // passes `global` for its active tab and `none` for the hidden one, kept
  // mounted. A control keeps its own keys either way: Space on a button
  // activates the button, not the simulation, and Tab from a control moves
  // focus.
  const handleKey = React.useCallback((e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
    const onControl = target !== null && target !== containerRef.current &&
      target.closest('button, select, a, [contenteditable], [role="tab"]') !== null
    if (onControl && e.key !== 'Escape') return

    switch (e.key) {
      case 'Tab': {
        // On the pane, Tab cycles nodes only while the pane itself is focused;
        // from anywhere else it moves focus as it always does.
        if (keyboard === 'pane' && target !== containerRef.current) return
        e.preventDefault()
        const count = visibleNodes.length
        if (count === 0) return
        if (e.shiftKey) {
          setFocusedIndex(prev => prev > 0 ? prev - 1 : count - 1)
        } else {
          setFocusedIndex(prev => prev < count - 1 ? prev + 1 : 0)
        }
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (focusedNodeId) setSelectedNodeId(focusedNodeId)
        break
      }
      case 'Escape': {
        e.preventDefault()
        if (shortcutsOpen) { setShortcutsOpen(false); break }
        if (searchActive) { toggleSearch(); break }
        if (selectedNodeId) { setSelectedNodeId(null); break }
        // Nothing left to close: on the pane, give focus back to the host.
        if (keyboard === 'pane') containerRef.current?.blur()
        break
      }
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault()
        const PAN_STEP = 30
        const dx = e.key === 'ArrowLeft' ? PAN_STEP : e.key === 'ArrowRight' ? -PAN_STEP : 0
        const dy = e.key === 'ArrowUp' ? PAN_STEP : e.key === 'ArrowDown' ? -PAN_STEP : 0
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
        break
      }
      case '+':
      case '=': {
        e.preventDefault()
        setViewport(prev => zoomAt(prev, (containerRef.current?.clientWidth ?? 400) / 2, (containerRef.current?.clientHeight ?? 400) / 2, 1.15))
        break
      }
      case '-':
      case '_': {
        e.preventDefault()
        setViewport(prev => zoomAt(prev, (containerRef.current?.clientWidth ?? 400) / 2, (containerRef.current?.clientHeight ?? 400) / 2, 0.85))
        break
      }
      case 'f':
      case 'F': {
        e.preventDefault()
        handleFitToView()
        break
      }
      case '/': {
        e.preventDefault()
        if (!searchActive) {
          setSearch({ query: searchQuery, active: true })
          setTimeout(() => searchInputRef.current?.focus(), 50)
        } else {
          searchInputRef.current?.focus()
        }
        break
      }
      case ' ': {
        e.preventDefault()
        handleToggleRunning()
        break
      }
      case '?': {
        e.preventDefault()
        setShortcutsOpen(prev => !prev)
        break
      }
    }
  }, [keyboard, visibleNodes, focusedNodeId, selectedNodeId, searchActive, searchQuery, setSearch, shortcutsOpen, handleFitToView, handleToggleRunning]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (keyboard !== 'global') return
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [keyboard, handleKey])
  const paneKeyDown = React.useCallback((e: React.KeyboardEvent) => handleKey(e.nativeEvent), [handleKey])

  // The hover box hands the host its own node object, never the simulation's copy.
  const hostCrossView = React.useMemo(() => crossView && {
    label: crossView.label,
    onFocus: (node: GraphNode) => crossView.onFocus(graph.nodes.get(node.id) ?? node),
  }, [crossView, graph])

  const nodeCount = visibleNodes.length
  const edgeCount = visibleEdges.length

  // Graph-view search adornment: the hidden-match "+N" badge.
  const searchExtra = hiddenMatchCount > 0 ? (
    <span className="gv-header-search-badge" title={`${hiddenMatchCount} match${hiddenMatchCount !== 1 ? 'es' : ''} hidden by filters`}>
      +{hiddenMatchCount}
    </span>
  ) : null

  return (
    <OntologyContext.Provider value={ontology}>
    <CanvasErrorBoundary what="graph view">
    <div
      className={`gv-graph-view${className ? ` ${className}` : ''}`}
      ref={containerRef}
      data-theme={theme}
      tabIndex={keyboard === 'pane' ? 0 : undefined}
      onKeyDown={keyboard === 'pane' ? paneKeyDown : undefined}
      style={{ ...schemeStyle, ...(toolbarHeight ? { ['--gv-toolbar-height' as string]: `${toolbarHeight}px` } : {}), ...style } as React.CSSProperties}
    >
      {/* Canvas fills the full viewport beneath the floating overlay */}
      <div className="gv-graph-canvas-area">
        <CanvasErrorBoundary>
          <GraphCanvas
            nodes={visibleNodes}
            edges={visibleEdges}
            viewport={viewport}
            onViewportChange={setViewport}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragMove={handleNodeDragMove}
            onNodeDragEnd={handleNodeDragEnd}
            onDoubleClickNode={handleDoubleClickNode}
            onHoverNode={handleHoverNode}
            onSelectNode={setSelectedNodeId}
            highlightedNodes={highlightedNodes}
            highlightedEdges={highlightedEdges}
            hoveredNodeId={hoveredNodeId}
            selectedNodeId={selectedNodeId}
            focusedNodeId={focusedNodeId}
            searchMatchIds={visibleMatchIds}
            running={running}
            forceParams={forceParams}
            resolved={resolved}
            overlay={overlay}
            theme={theme}
            edgeStrokes={edgeStrokes}
            edgeOffsets={edgeOffsets}
            activeSection={activeSection}
            activePushBucket={activePushBucket}
            activeGravityBucket={activeGravityBucket}
            activePullEdge={activePullEdge}
            nodeScale={nodeScale}
            groupGlows={glowGroups}
          />
        </CanvasErrorBoundary>
        <GraphHoverTooltip
          hoveredNodeId={hoveredNodeId}
          simRef={simRef}
          visibleEdges={visibleEdges}
          visibleIds={visibleIds}
          viewport={viewport}
          shiftHeld={shiftHeld}
          copies={copies}
          nodeSummaries={nodeSummaries}
          crossView={hostCrossView}
          onMouseEnter={cancelHoverClear}
          onMouseLeave={() => handleHoverNode(null)}
        />
      </div>

      {/* Floating overlay: the shared filter bar (with the host's findings), the
          pane's own diagnostics, the search results. Measured whole: its height
          is `--gv-toolbar-height`, where a host control anchors. */}
      <div className="gv-graph-overlay" ref={toolbarRef}>
        <div className="gv-graph-toolbar">
          <FilterBar
            counts={counts}
            values={valuesByDimension}
            filter={filter}
            onFilterChange={setFilter}
            pins={pins}
            onPinsChange={setPins}
            chain={chain}
            onChainChange={chainEditable ? setChain : undefined}
            overriddenPins={flashPins}
            recentlyChanged={recentlyChanged}
            search={search}
            onSearchChange={setSearch}
            searchInputRef={searchInputRef}
            searchTitle="Search nodes (/)"
            searchPlaceholder="Search nodes..."
            searchExtra={searchExtra}
            hiddenMatches={hiddenMatches}
            findings={findings}
          />
        </div>

        {diagnostics.length > 0 && <GraphDiagnostics diagnostics={diagnostics} />}

        {/* Search results dropdown */}
        {visibleMatchIds && visibleMatchIds.size > 0 && searchActive && (
          <div className="gv-graph-search-results">
            {visibleNodes.filter(n => visibleMatchIds.has(n.id)).map(n => (
              <button
                key={n.id}
                className="gv-graph-search-result"
                onClick={() => handleSelectSearchResult(n.id)}
              >
                <span className="gv-graph-search-result-type">{ontology.resolveNodeStyle(n).label}</span>
                <span className="gv-graph-search-result-name">{n.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>{/* /graph-overlay */}

      {/* Bottom-left: node/edge counts (shifts right when the shortcuts panel
          is open so they don't overlap). */}
      <div className={`gv-graph-bottom-left${shortcutsOpen ? ' shifted' : ''}`}>
        <span className="gv-graph-count">
          {nodeCount} node{nodeCount !== 1 ? 's' : ''}, {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bottom-center: simulation controls + live fps. */}
      <div className="gv-graph-bottom-center">
        <button className="gv-graph-toolbar-btn" onClick={handleFitToView} title="Fit to view (F)">Fit</button>
        {themeToggle && (
          <button
            className={`gv-graph-toolbar-btn${themeChoice === 'system' ? '' : ' active'}`}
            onClick={() => setThemeChoice(THEME_CHOICES[(THEME_CHOICES.indexOf(themeChoice) + 1) % THEME_CHOICES.length])}
            title={`Colour scheme: ${themeChoice}${themeChoice === 'system' ? ` (${theme})` : ''} — click to change`}
            aria-label="Colour scheme"
          >
            {themeChoice === 'system' ? 'Auto' : themeChoice === 'light' ? 'Light' : 'Dark'}
          </button>
        )}
        <button
          className={`gv-graph-toolbar-btn ${running ? 'active' : ''}`}
          onClick={handleToggleRunning}
          title={running ? 'Pause simulation (Space)' : 'Resume simulation (Space)'}
        >
          {running ? 'Pause' : 'Play'}
        </button>
        {/* Always rendered (reserving its width) so toggling Play/Pause never
            shifts the centred cluster; hidden when the simulation is paused. */}
        <span className={`gv-graph-count-fps${running ? '' : ' hidden'}`} title="Simulation frames per second">{fps} fps</span>
      </div>

      {/* Control panel */}
      {controls && <GraphControlPanel
        params={forceParams}
        resolved={resolved}
        onParamChange={handleParamChange}
        onAdjust={handleForceAdjust}
        onRelayout={handleRelayout}
        axes={axes}
        layoutAxes={layoutAxes}
        present={present}
        onAxisChange={handleAxisChange}
        onActiveSection={setActiveSection}
        onActivePushBucket={setActivePushBucket}
        onActiveGravityBucket={setActiveGravityBucket}
        onActivePullEdge={setActivePullEdge}
        nodeScale={nodeScale}
        onNodeScaleChange={handleNodeScaleChange}
      />}

      {/* The host's control for its groups (top-left), handed the groups as drawn. */}
      {groupsControl?.(activeGroups)}

      {/* Shortcuts panel */}
      {shortcutsOpen && (
        <div className="gv-graph-shortcuts-panel">
          <div className="gv-graph-shortcuts-title">
            Keyboard Shortcuts
            <button className="gv-graph-shortcuts-close" onClick={() => setShortcutsOpen(false)}>&times;</button>
          </div>
          <div className="gv-graph-shortcuts-list">
            <Shortcut keys="Tab / Shift+Tab" desc="Cycle focus" />
            <Shortcut keys="Enter" desc="Select focused node" />
            <Shortcut keys="Escape" desc="Deselect / close" />
            <Shortcut keys="Arrow keys" desc="Pan viewport" />
            <Shortcut keys="+ / -" desc="Zoom in / out" />
            <Shortcut keys="F" desc="Fit to view" />
            <Shortcut keys="/" desc="Open search" />
            <Shortcut keys="Space" desc="Toggle simulation" />
            <Shortcut keys="Shift + hover" desc="Upstream deps" />
            <Shortcut keys="?" desc="This panel" />
          </div>
        </div>
      )}
    </div>
    </CanvasErrorBoundary>
    </OntologyContext.Provider>
  )
})

/** The pane's own findings about the host's graph: each with its code; errors name edges the view does not draw. */
function GraphDiagnostics({ diagnostics }: { diagnostics: readonly GraphDiagnostic[] }) {
  const errors = diagnostics.filter(d => d.severity === 'error').length
  const warnings = diagnostics.length - errors
  const parts: string[] = []
  if (errors > 0) parts.push(`${errors} graph error${errors === 1 ? '' : 's'}`)
  if (warnings > 0) parts.push(`${warnings} graph warning${warnings === 1 ? '' : 's'}`)
  return (
    <details className={`gv-graph-diagnostics${errors > 0 ? ' has-errors' : ''}`} role={errors > 0 ? 'alert' : undefined}>
      <summary>{parts.join(', ')}{errors > 0 ? ' — the edges named are not drawn' : ''}</summary>
      <ul>
        {diagnostics.map((d, i) => (
          <li key={i} className={`gv-graph-diagnostic ${d.severity}`}><code>{d.code}</code>{d.message}</li>
        ))}
      </ul>
    </details>
  )
}

interface GraphHoverTooltipProps {
  hoveredNodeId: string | null
  simRef: React.RefObject<Simulation | null>
  visibleEdges: GraphEdge[]
  visibleIds: Set<string>
  viewport: Viewport
  shiftHeld: boolean
  /** Every node's copies by their shared key, over the whole graph. */
  copies: ReadonlyMap<string, ReadonlySet<string>>
  nodeSummaries: Map<string, string>
  // The host's cross-view action from the tooltip, when it offers one.
  crossView?: { label: string; onFocus: (node: GraphNode) => void }
  // The tooltip is interactive: these keep it open while the pointer is over
  // it (so the cross-view button is clickable).
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function GraphHoverTooltip({ hoveredNodeId, simRef, visibleEdges, visibleIds, viewport, shiftHeld, copies, nodeSummaries, crossView, onMouseEnter, onMouseLeave }: GraphHoverTooltipProps) {
  // Before the early returns: this is a hook, and the component bails out four
  // different ways below.
  const ontology = useOntology()
  if (!hoveredNodeId) return null
  const sim = simRef.current
  if (!sim) return null
  const node = sim.getNode(hoveredNodeId)
  if (!node) return null

  // The context under the name is the taxonomy's answer: a host that keys a
  // value's identity on its own metadata says so there, as one line or
  // several; the library's default is the parent's name. The icon is the
  // value's own.
  const context = ontology.contextLine(node, node.parentId ? sim.getNode(node.parentId) : undefined)
  const contextLines = context === undefined ? [] : typeof context === 'string' ? [context] : [...context]
  const icon = ontology.resolveNodeStyle(node).icon

  // The composition line for a node that summarises its children (counted
  // per style value, named by its abbreviation). These used to render as a
  // badge under the node; they now live in the box. Degree nodes are covered
  // by the connection counts row below, so we don't duplicate them here.
  const summaryKind = ontology.resolveNodeStyle(node).summaryKind
  const compositionLine =
    summaryKind === 'children'
      ? nodeSummaries.get(hoveredNodeId) || undefined
      : undefined

  // The node's badges, as the canvas draws them above it, in one line.
  const badgesLine = node.badges && node.badges.length > 0 ? node.badges.join(' ') : undefined

  let outgoing = 0, incoming = 0
  for (const e of visibleEdges) {
    if (isContainment(e)) continue
    if (e.sourceId === hoveredNodeId) outgoing++
    if (e.targetId === hoveredNodeId) incoming++
  }

  // Copies indicator: when the same entity has more than one node in the
  // graph, say "copy i of N" so the user knows the halo they're seeing is
  // intentional. Count only copies that survive the current filter — a hidden
  // copy isn't a copy from the user's current point of view.
  const sisters = copies.get(copyKeyOf(node))
  const visibleCopies = sisters
    ? Array.from(sisters).filter(id => visibleIds.has(id))
    : [node.id]
  const copyCount = visibleCopies.length
  const copyIndex = copyCount > 1 ? visibleCopies.indexOf(node.id) + 1 : 0

  const [sx, sy] = worldToScreen(viewport, node.x, node.y)

  return (
    <div
      className="gv-graph-hover-tooltip"
      style={{ left: sx, top: sy }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="gv-tooltip-identity">
        {icon && <span className="gv-tooltip-type-icon">{icon}</span>}
        <span className="gv-tooltip-name">{node.name}</span>
      </div>
      {contextLines.map((line, i) => <div key={i} className="gv-tooltip-parent">{line}</div>)}
      {compositionLine && <div className="gv-tooltip-summary">{compositionLine}</div>}
      {badgesLine && <div className="gv-tooltip-summary">{badgesLine}</div>}
      {copyCount > 1 && (
        <div className="gv-tooltip-duplicates" title="The same entity appears in more than one place. Hovering any copy marks all copies.">
          copy {copyIndex} of {copyCount}
        </div>
      )}
      {(outgoing > 0 || incoming > 0) && (
        <div className="gv-tooltip-connections">
          {outgoing > 0 && <span className="gv-tooltip-conn-out">→{outgoing}</span>}
          {incoming > 0 && <span className="gv-tooltip-conn-in">←{incoming}</span>}
        </div>
      )}
      <div className="gv-tooltip-direction">{shiftHeld ? 'dependents' : 'dependencies'}</div>
      {crossView && (
        <button
          className="gv-tooltip-cross-view"
          onClick={() => crossView.onFocus(node)}
          title={crossView.label}
        >
          {crossView.label}
        </button>
      )}
    </div>
  )
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="gv-graph-shortcut-row">
      <kbd className="gv-graph-shortcut-key">{keys}</kbd>
      <span className="gv-graph-shortcut-desc">{desc}</span>
    </div>
  )
}

