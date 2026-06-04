// Graph View: force-directed visualization of definition relationships.
// Wires together graph construction, simulation, viewport, rendering, and interaction.

import React from 'react'
import type { TWFFile, FileError, Diagnostic } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import type { CrossViewTarget } from './WorkflowCanvas'
import type { ForceParams } from '../graph/simulation'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import { filterStatesEqual } from '../filter/types'
import { buildGraph } from '../graph/build'
import { Simulation, DEFAULT_PARAMS } from '../graph/simulation'
import type { SimNode } from '../graph/simulation'
import type { NodeType } from '../graph/model'
import { definitionFor, ALL_NODE_TYPES as _ALL_NODE_TYPES, NODE_TYPE_REGISTRY } from '../graph/node-types'
import { DEFAULT_VIEWPORT, fitToView, worldToScreen } from '../graph/viewport'
import type { Viewport } from '../graph/viewport'
import { zoomAt } from '../graph/viewport'
import { getTransitiveDeps, getHighlightedEdgeIds } from '../graph/highlight'
import { GraphCanvas } from './GraphCanvas'
import { GraphControlPanel } from './GraphControlPanel'
import type { ForceSection } from './GraphControlPanel'
import { PinToggle } from './PinToggle'
import { GraphContextMenu, type ContextMenuItem } from './GraphContextMenu'
import { SearchIcon } from './icons/GearIcons'
import { DEF_TYPE_CONFIGS, VIEW_FILTER_ENTRIES } from '../theme/temporal-theme'

interface GraphViewProps {
  ast: TWFFile
  // Deployment graph from `twf graph` — primary input. AST is secondary
  // (sourceFile lookup, hover details). See visualizer/REVISIONS_003.
  parserGraph: ParserGraph
  onShowInTree?: (name: string, defType: string) => void
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  pins: PinState
  onPinsChange: (next: PinState) => void
  searchQuery: string
  searchActive: boolean
  onSearchChange: (query: string, active: boolean) => void
  pendingFocus: CrossViewTarget | null
  onFocusConsumed: () => void
  overriddenPins: Set<FilterDimension>
  onOverriddenPinsConsumed: () => void
}

// Map graph nodeType → AST defType and back, derived from the registry.
// Built once at module load; all 7 node types are covered by ALL_NODE_TYPES.
const _NODE_TYPE_TO_DEF_TYPE = Object.fromEntries(
  _ALL_NODE_TYPES.map(t => [t, NODE_TYPE_REGISTRY[t].defType])
) as Record<string, string>

const _DEF_TYPE_TO_NODE_TYPE = Object.fromEntries(
  _ALL_NODE_TYPES.map(t => [NODE_TYPE_REGISTRY[t].defType, t])
) as Record<string, string>

function nodeTypeToDefType(nodeType: string): string {
  return _NODE_TYPE_TO_DEF_TYPE[nodeType] ?? 'workflowDef'
}

function defTypeToNodeType(defType: string): string {
  return _DEF_TYPE_TO_NODE_TYPE[defType] ?? 'workflow'
}

// Walk parentId chain to find nearest ancestor that is in visibleIds
function findNearestVisibleAncestor(
  nodeId: string,
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined
): string | null {
  const node = getNode(nodeId)
  if (!node) return null
  let id: string | undefined = node.parentId
  while (id) {
    if (visibleIds.has(id)) return id
    const parent = getNode(id)
    id = parent?.parentId
  }
  return null
}

// Resolve a dependency-edge endpoint (source or target) to one or more
// visible node ids. The default behaviour is "if visible, keep; otherwise
// walk up to the nearest visible ancestor", which matches what containment
// edges do. The exception is hidden nexus operations: we *splice through*
// instead of ascending, because a hidden operation should be replaced by
// the call relationship it sits on top of — caller → operation → backing
// becomes caller → backing, not caller → worker.
//
// `side` controls which adjacent edges we follow when splicing: from the
// target side we follow the operation's outgoing dep edges (one operation
// can have several callees if it's a sync op with a body); from the source
// side we follow incoming dep edges (one operation can have several
// callers). This produces a Cartesian explosion in the rare case where a
// hidden node has both many incoming and many outgoing edges, but the
// graduation step's `depEdgeKeys` Map dedupes anything redundant.
function resolveDepEndpoint(
  nodeId: string,
  visible: boolean,
  side: 'src' | 'tgt',
  sim: { edges: { edgeType: string; sourceId: string; targetId: string }[] },
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined,
): string[] {
  if (visible) return [nodeId]
  const node = getNode(nodeId)
  if (node?.nodeType === 'nexusOperation') {
    const out: string[] = []
    for (const e of sim.edges) {
      if (e.edgeType !== 'dependency') continue
      const adjId = side === 'tgt'
        ? (e.sourceId === nodeId ? e.targetId : null)  // outgoing — operation is source
        : (e.targetId === nodeId ? e.sourceId : null)  // incoming — operation is target
      if (!adjId) continue
      // Recurse: a chain of hidden operations is unusual but cheap to walk.
      // The recursion terminates because each step moves to a new node id.
      for (const r of resolveDepEndpoint(adjId, visibleIds.has(adjId), side, sim, visibleIds, getNode)) {
        out.push(r)
      }
    }
    if (out.length > 0) return out
  }
  const ancestor = findNearestVisibleAncestor(nodeId, visibleIds, getNode)
  return ancestor ? [ancestor] : []
}

// Compute per-node downstream-depth scores over the visible dependency
// subgraph, linearly normalized to [0, 1] globally.
//
// "Downstream depth" = the number of call-levels in a node's subtree (BFS hops
// to its deepest reachable leaf along outgoing `dependency` edges; containment
// edges ignored). Only workflow and nexusOperation have outgoing dep edges, so
// only they get a raw depth; the deepest such node anchors score = 1.
//
// That raw depth is then **propagated up the containment hierarchy** (via each
// node's `parentId`): a container is scored at least as deep as anything it
// hosts. Without this, a deep workflow gets a strong topological (root-ward)
// pull while its own worker/namespace — which have no dep edges and would score
// 0 — get none, so the workflow is dragged *above* its container, inverting the
// tier order band gravity is trying to hold. Propagation keeps containers at or
// above their contents, so the two gravities reinforce rather than fight.
// Cycles are handled by the per-BFS visited set and the per-walk guard.
//
// The simulation consumes this map through `tick(visibleIds, downstreamScores)`
// to apply the downstream-Y gravity force. The map is recomputed only when
// the visible-edge memo recomputes (i.e. on filter / graph change), never
// per frame, so the BFS cost amortizes away.
function computeDownstreamScores(
  visibleNodes: SimNode[],
  visibleEdges: { edgeType: string; sourceId: string; targetId: string }[],
): Map<string, number> {
  // Pre-build the dep-only adjacency list once so each BFS is O(V + E)
  // rather than re-scanning every edge per source.
  const adj = new Map<string, string[]>()
  for (const e of visibleEdges) {
    if (e.edgeType !== 'dependency') continue
    const list = adj.get(e.sourceId)
    if (list) list.push(e.targetId)
    else adj.set(e.sourceId, [e.targetId])
  }

  // "Root-ness" = downstream depth: how many call-levels deep a node's subtree
  // goes (BFS distance to its deepest reachable leaf). Unlike transitive reach
  // count, depth is naturally tiered rather than combinatorially heavy-tailed,
  // so a plain linear normalize spreads cleanly with no log compression — and it
  // tracks "sits atop a deep call chain" better than "fans out to many leaves".
  const depths = new Map<string, number>()
  let maxDepth = 0
  for (const node of visibleNodes) {
    const seen = new Set<string>([node.id])
    let depth = 0
    let frontier: string[] = [node.id]
    while (frontier.length > 0) {
      const next: string[] = []
      for (const cur of frontier) {
        const out = adj.get(cur)
        if (!out) continue
        for (const t of out) {
          if (seen.has(t)) continue
          seen.add(t)
          next.push(t)
        }
      }
      if (next.length > 0) depth++
      frontier = next
    }
    depths.set(node.id, depth)
    if (depth > maxDepth) maxDepth = depth
  }

  const scores = new Map<string, number>()
  if (maxDepth === 0) {
    // No outgoing reach anywhere — every score is 0. Return an empty map
    // so the simulation's `score ?? 0` fallback short-circuits the loop.
    return scores
  }

  // Propagate each node's raw depth up its containment chain so a container is
  // scored at least as deep as anything it hosts (keeps tiers from inverting).
  const byId = new Map(visibleNodes.map(n => [n.id, n]))
  const effective = new Map<string, number>()
  for (const node of visibleNodes) effective.set(node.id, depths.get(node.id) ?? 0)
  for (const node of visibleNodes) {
    const d = depths.get(node.id) ?? 0
    if (d <= 0) continue
    let pid = node.parentId
    const guard = new Set<string>()
    while (pid && !guard.has(pid)) {
      guard.add(pid)
      // Ancestor already at least this deep ⇒ so are its own ancestors. Stop.
      if ((effective.get(pid) ?? 0) >= d) break
      effective.set(pid, d)
      pid = byId.get(pid)?.parentId
    }
  }

  for (const [id, d] of effective) {
    scores.set(id, d / maxDepth)
  }
  return scores
}

// Compute a glanceable summary string for a graph node from the visible edge set.
// Dispatches on the registry's `summaryKind` so the logic is driven by node
// type identity, not by the removed `level` field.
function computeGraphNodeSummary(
  node: SimNode,
  visibleEdges: { edgeType: string; sourceId: string; targetId: string }[],
  nodeMap: Map<string, SimNode>
): string {
  const { summaryKind } = definitionFor(node.nodeType)

  if (summaryKind === 'containerCount') {
    // Namespace: count contained workers and endpoints separately.
    let workers = 0, endpoints = 0
    for (const e of visibleEdges) {
      if (e.edgeType !== 'containment' || e.targetId !== node.id) continue
      const child = nodeMap.get(e.sourceId)
      if (!child) continue
      if (child.nodeType === 'worker') workers++
      else if (child.nodeType === 'nexusEndpoint') endpoints++
    }
    const parts: string[] = []
    if (workers > 0) parts.push(`${workers} worker${workers !== 1 ? 's' : ''}`)
    if (endpoints > 0) parts.push(`${endpoints} endpoint${endpoints !== 1 ? 's' : ''}`)
    return parts.join(' · ')
  }

  if (summaryKind === 'none') return ''

  if (summaryKind === 'hostRegistrations') {
    // Worker: count contained workflows, activities, and nexus services.
    // NexusService: count contained nexus operations.
    let wf = 0, act = 0, nxs = 0, ops = 0
    for (const e of visibleEdges) {
      if (e.edgeType !== 'containment' || e.targetId !== node.id) continue
      const child = nodeMap.get(e.sourceId)
      if (!child) continue
      if (child.nodeType === 'workflow') wf++
      else if (child.nodeType === 'activity') act++
      else if (child.nodeType === 'nexusService') nxs++
      else if (child.nodeType === 'nexusOperation') ops++
    }
    if (node.nodeType === 'nexusService') {
      return ops > 0 ? `${ops} op${ops !== 1 ? 's' : ''}` : ''
    }
    const parts: string[] = []
    if (wf > 0) parts.push(`${wf}wf`)
    if (act > 0) parts.push(`${act}act`)
    if (nxs > 0) parts.push(`${nxs}nxs`)
    return parts.join(' · ')
  }

  // summaryKind === 'degree'
  let out = 0, inc = 0
  for (const e of visibleEdges) {
    if (e.edgeType === 'containment') continue
    if (e.sourceId === node.id) out++
    if (e.targetId === node.id) inc++
  }
  const parts: string[] = []
  if (out > 0) parts.push(`→${out}`)
  if (inc > 0) parts.push(`←${inc}`)
  return parts.join(' ')
}

// Graph-view filter entries — imported from temporal-theme.tsx so the Tree and
// Graph views always show the same chip layout. See VIEW_FILTER_ENTRIES.

export function GraphView({
  ast,
  parserGraph,
  onShowInTree,
  filter,
  onFilterChange,
  pins,
  onPinsChange,
  searchQuery,
  searchActive,
  onSearchChange,
  pendingFocus,
  onFocusConsumed,
  overriddenPins,
  onOverriddenPinsConsumed,
}: GraphViewProps) {
  // Filter state is now driven by props from WorkflowCanvas (spec § Filter
  // State Model). Read the two structural dimensions through `filter`.
  const visibleTypes = filter.visibleTypes
  const selectedFiles = filter.selectedFiles

  // --- Core state ---
  const [viewport, setViewport] = React.useState<Viewport>(DEFAULT_VIEWPORT)
  const [running, setRunning] = React.useState(true)
  const [forceParams, setForceParams] = React.useState<ForceParams>({ ...DEFAULT_PARAMS })
  const simRef = React.useRef<Simulation | null>(null)
  const dragNodeRef = React.useRef<string | null>(null)
  const initialFitDone = React.useRef(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const pendingCenterRef = React.useRef<{ nodeId: string } | null>(null)
  // Frame-rate indicator for debugging. Updated ~2×/sec from the physics loop.
  const [fps, setFps] = React.useState(0)
  const fpsTrackRef = React.useRef({ frames: 0, lastStamp: 0 })

  // --- Interaction state ---
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const [shiftHeld, setShiftHeld] = React.useState(false)

  // --- Force field visualization (hover-driven; no persistent toggle) ---
  const [activeSection, setActiveSection] = React.useState<ForceSection>(null)
  const [activeChargeType, setActiveChargeType] = React.useState<NodeType | null>(null)
  const [activeGravityType, setActiveGravityType] = React.useState<NodeType | null>(null)
  // The pull edge category (k-field key) currently being hovered/tuned in the
  // spring map; drives the canvas single-edge tension highlight.
  const [activePullEdge, setActivePullEdge] = React.useState<string | null>(null)

  // --- Search ---
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

  // --- Right-click context menu ---
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; nodeId: string } | null>(null)

  // --- Filter change tracking for transient animation on focus transitions ---
  const prevFilterRef = React.useRef<FilterState>(filter)
  const [recentlyChanged, setRecentlyChanged] = React.useState<Set<string>>(new Set())
  React.useEffect(() => {
    const prev = prevFilterRef.current
    if (filterStatesEqual(prev, filter)) return
    const changed = new Set<string>()
    for (const f of filter.selectedFiles) if (!prev.selectedFiles.has(f)) changed.add(`file:${f}`)
    for (const t of filter.visibleTypes) if (!prev.visibleTypes.has(t)) changed.add(`type:${t}`)
    prevFilterRef.current = filter
    if (changed.size > 0) {
      setRecentlyChanged(changed)
      const timer = setTimeout(() => setRecentlyChanged(new Set()), 450)
      return () => clearTimeout(timer)
    }
  }, [filter])

  // Clear pin-override flash after ~600ms so the visual flash plays once.
  React.useEffect(() => {
    if (overriddenPins.size === 0) return
    const timer = setTimeout(onOverriddenPinsConsumed, 600)
    return () => clearTimeout(timer)
  }, [overriddenPins, onOverriddenPinsConsumed])

  // Build view-side graph from the parser's deployment graph.
  // AST is consulted for sourceFile (the file-filter chip reads this) and
  // for future hover-detail enrichments. See visualizer/REVISIONS_003.
  const graph = React.useMemo(
    () => buildGraph(parserGraph, ast),
    [parserGraph, ast],
  )

  // Bumped after each simulation (re)creation so memos that read from
  // simRef.current can be invalidated. Without this signal the
  // visibleNodes memo cached an empty result on first render — when
  // simRef.current was still null — and never recomputed because its
  // structural deps hadn't changed.
  const [simVersion, setSimVersion] = React.useState(0)

  // Create or update simulation when graph changes
  React.useEffect(() => {
    simRef.current = new Simulation(graph, forceParams)
    initialFitDone.current = false
    fpsTrackRef.current = { frames: 0, lastStamp: 0 }
    setRunning(true)
    setSelectedNodeId(null)
    setHoveredNodeId(null)
    setFocusedIndex(-1)
    setSimVersion(v => v + 1)
  }, [graph]) // eslint-disable-line react-hooks/exhaustive-deps

  // Extract all unique source files from graph nodes
  const allFiles = React.useMemo(() => {
    const files = new Set<string>()
    for (const node of graph.nodes.values()) {
      if (node.sourceFile) files.add(node.sourceFile)
    }
    return Array.from(files).sort()
  }, [graph])

  // Stale-file cleanup is now owned by WorkflowCanvas (it touches both views'
  // filters consistently when the AST changes).

  // Filter visible nodes by type toggles + file filter
  const { visibleNodes, visibleEdges, visibleIds, nodeSummaries, downstreamScores } = React.useMemo(() => {
    const sim = simRef.current
    if (!sim) return { visibleNodes: [] as SimNode[], visibleEdges: [], visibleIds: new Set<string>(), nodeSummaries: new Map<string, string>(), downstreamScores: new Map<string, number>() }

    const hasFileFilter = selectedFiles.size > 0
    const ids = new Set<string>()
    const vNodes: SimNode[] = []

    for (const node of sim.nodes) {
      if (!visibleTypes.has(nodeTypeToDefType(node.nodeType))) continue
      if (hasFileFilter && node.sourceFile && !selectedFiles.has(node.sourceFile)) continue
      ids.add(node.id)
      vNodes.push(node)
    }

    // Graduate edges across hidden types.
    // Containment: if child visible but parent hidden, walk up to nearest visible ancestor.
    // Dependency: if either endpoint hidden, project to nearest visible ancestor; deduplicate.
    const getNode = (id: string) => sim.getNode(id)
    const graduatedEdges: typeof sim.edges = []
    const depEdgeKeys = new Map<string, (typeof sim.edges)[0]>()

    for (const edge of sim.edges) {
      const srcVisible = ids.has(edge.sourceId)
      const tgtVisible = ids.has(edge.targetId)

      if (edge.edgeType === 'containment') {
        if (!srcVisible) continue  // hidden child — drop
        if (tgtVisible) {
          graduatedEdges.push(edge)  // both visible — keep as-is
        } else {
          // parent hidden — walk up to nearest visible ancestor
          const ancestor = findNearestVisibleAncestor(edge.targetId, ids, getNode)
          if (ancestor) {
            const ancestorNode = getNode(ancestor)
            graduatedEdges.push({
              ...edge,
              targetId: ancestor,
              targetNodeType: ancestorNode?.nodeType ?? edge.targetNodeType,
              id: `grad:${edge.id}`,
            })
          }
          // else child floats free — no containment edge
        }
      } else {
        // dependency — project both endpoints to a visible node.
        //
        // Most endpoints just walk the parent chain to a visible ancestor.
        // The exception is hidden nexusOperation nodes: we DO NOT want to
        // ascend (caller → worker would lose the call relationship). Instead
        // we splice through the operation to whatever the operation is
        // calling — that gives caller → backing-workflow when the operation
        // layer is filtered out, preserving the "this is a nexus call"
        // pink styling via `nexusEndpoint` metadata copied from the
        // original edge.
        const resolvedSources = resolveDepEndpoint(edge.sourceId, srcVisible, 'src', sim, ids, getNode)
        const resolvedTargets = resolveDepEndpoint(edge.targetId, tgtVisible, 'tgt', sim, ids, getNode)
        for (const rs of resolvedSources) {
          for (const rt of resolvedTargets) {
            if (rs === rt) continue
            const key = `${rs}→${rt}`
            const existing = depEdgeKeys.get(key)
            // Prefer the edge that carries `nexusEndpoint` so the spliced
            // caller → backing case keeps its pink styling regardless of
            // which side of the chain we processed first (the op → backing
            // delegation has no endpoint; the caller → op call site does).
            if (existing && existing.nexusEndpoint && !edge.nexusEndpoint) continue
            const srcNode = getNode(rs)
            const tgtNode = getNode(rt)
            depEdgeKeys.set(key, {
              ...edge,
              sourceId: rs,
              targetId: rt,
              sourceNodeType: srcNode?.nodeType ?? edge.sourceNodeType,
              targetNodeType: tgtNode?.nodeType ?? edge.targetNodeType,
              id: `grad:${key}`,
            })
          }
        }
      }
    }

    const vEdges = [...graduatedEdges, ...depEdgeKeys.values()]

    // Compute per-node summaries from the graduated visible edge set
    const vNodeMap = new Map<string, SimNode>()
    for (const n of vNodes) vNodeMap.set(n.id, n)
    const nodeSummaries = new Map<string, string>()
    for (const node of vNodes) {
      const s = computeGraphNodeSummary(node, vEdges, vNodeMap)
      if (s) nodeSummaries.set(node.id, s)
    }

    // Downstream-reach scores over the graduated visible dep subgraph.
    // Consumed by the simulation's downstream-Y gravity force; computed
    // here so it recomputes only on filter / graph changes, never per frame.
    const downstreamScores = computeDownstreamScores(vNodes, vEdges)

    return { visibleNodes: vNodes, visibleEdges: vEdges, visibleIds: ids, nodeSummaries, downstreamScores }
    // simVersion is the signal that simRef.current has been (re)assigned;
    // without it this memo would cache the first-render empty result
    // (when the sim hadn't been created yet) and never recompute on the
    // next render where the sim is finally available.
  }, [visibleTypes, selectedFiles, graph, simVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search matches against all nodes (not just visible). When search is
  // active we return a Set even if empty so the canvas dims everything —
  // an empty search with a query is "no matches yet, all non-matching",
  // not "no search active".
  const { visibleMatchIds, hiddenMatchCount } = React.useMemo(() => {
    if (!searchQuery) return { visibleMatchIds: null as Set<string> | null, hiddenMatchCount: 0 }
    const lq = searchQuery.toLowerCase()
    const sim = simRef.current
    if (!sim) return { visibleMatchIds: new Set<string>(), hiddenMatchCount: 0 }

    const visible = new Set<string>()
    let hidden = 0
    for (const node of sim.nodes) {
      if (node.name.toLowerCase().includes(lq)) {
        if (visibleIds.has(node.id)) {
          visible.add(node.id)
        } else {
          hidden++
        }
      }
    }
    return { visibleMatchIds: visible, hiddenMatchCount: hidden }
  }, [searchQuery, visibleIds])

  // Transitive dependency highlighting.
  //
  // The active node's transitive dep chain is unioned with every sister
  // copy of the same underlying definition (see
  // `Graph.duplicateGroups`) so that hovering one copy keeps every
  // other copy of the same activity / workflow / service / operation
  // legible. That's the visual cue that links the duplicates: they
  // share opacity with the hovered node while everything unrelated
  // dims, telling the user "all of these green dots are the same
  // thing, just on different workers".
  //
  // Two nexus-specific overrides apply before the generic BFS:
  //
  //   nexusEndpoint — endpoints have no outgoing dep edges; transitive
  //   BFS would return only the endpoint itself. Instead we follow the
  //   `nexusEndpoint` routing metadata on visible edges and highlight
  //   every nexus call that routes through this endpoint, making the
  //   fan-out immediately visible.
  //
  //   nexusService — after the normal BFS, additionally highlight any
  //   visible nexusEndpoint nodes whose (namespace, queue) match the
  //   service's deployment. This is a derived inference computed at hover
  //   time — the endpoint fronts calls to this service, but the parser
  //   correctly doesn't emit a persistent endpoint→service edge.
  const { highlightedNodes, highlightedEdges } = React.useMemo(() => {
    const activeId = hoveredNodeId ?? selectedNodeId
    if (!activeId || !visibleIds.has(activeId)) {
      return { highlightedNodes: null as Set<string> | null, highlightedEdges: null as Set<string> | null }
    }

    const activeNode = simRef.current?.getNode(activeId)

    // nexusEndpoint: routing fan-out highlight via edge metadata.
    if (activeNode?.nodeType === 'nexusEndpoint') {
      const nodes = new Set<string>([activeId])
      const edges = new Set<string>()
      // Pull in the namespace parent for context so the user sees where
      // the endpoint lives, not just which calls pass through it.
      if (activeNode.parentId && visibleIds.has(activeNode.parentId)) {
        nodes.add(activeNode.parentId)
      }
      for (const edge of visibleEdges) {
        if (edge.nexusEndpoint === activeNode.name) {
          edges.add(edge.id)
          if (visibleIds.has(edge.sourceId)) nodes.add(edge.sourceId)
          if (visibleIds.has(edge.targetId)) nodes.add(edge.targetId)
        }
      }
      return { highlightedNodes: nodes, highlightedEdges: edges }
    }

    const direction = shiftHeld ? 'upstream' as const : 'downstream' as const
    const nodes = getTransitiveDeps(activeId, visibleEdges, visibleIds, direction)

    // nexusService: augment the standard dep chain with endpoints that
    // front this service's task queue in the same namespace. Matching is
    // on (namespace, queue) — both come from parser deployment metadata.
    if (activeNode?.nodeType === 'nexusService' && activeNode.namespace && activeNode.queue) {
      const svcNs = activeNode.namespace
      const svcQ = activeNode.queue
      for (const n of visibleNodes) {
        if (n.nodeType === 'nexusEndpoint' && n.namespace === svcNs && n.queue === svcQ) {
          nodes.add(n.id)
          if (n.parentId && visibleIds.has(n.parentId)) nodes.add(n.parentId)
        }
      }
    }

    // Sister copies of the active definition are intentionally NOT added to
    // highlightedNodes here. They will be dimmed like any other off-chain node,
    // but the canvas draws a full-color duplicate halo on them so the user can
    // still identify that they share a definition with the active node.
    const edges = getHighlightedEdgeIds(nodes, visibleEdges)
    return { highlightedNodes: nodes, highlightedEdges: edges }
  }, [hoveredNodeId, selectedNodeId, shiftHeld, visibleEdges, visibleIds, visibleNodes, graph])

  // Physics animation loop.
  //
  // Decoupled from React rendering: the canvas has its own requestAnimationFrame
  // draw loop that reads live SimNode.x/.y through a ref, so the physics tick does
  // NOT need to trigger a React re-render each frame. We only touch React state
  // for one-shot events (initial fit, pending cross-view center, stability, FPS).
  // Hierarchical gravity (X anchor + per-type Y bands) keeps world coordinates
  // stable, so we no longer compensate for COM drift on the canvas side.
  React.useEffect(() => {
    if (!running) return
    let frameId = 0

    const loop = () => {
      const sim = simRef.current
      if (!sim) return

      sim.tick(visibleIds, downstreamScores)

      // Initial fit — once per sim instance, after warmup. With hierarchical
      // gravity the world coordinates are anchored, so a one-shot fit is all
      // we need; the graph won't drift out of frame as the simulation runs.
      if (!initialFitDone.current && sim.alpha < 0.3) {
        const container = containerRef.current
        if (container) {
          const { width, height } = container.getBoundingClientRect()
          if (width > 0 && height > 0) {
            setViewport(fitToView(visibleNodes, width, height))
            initialFitDone.current = true
          }
        }
      }

      // Cross-view navigation: center on target after warmup.
      if (initialFitDone.current && pendingCenterRef.current) {
        const targetNode = sim.getNode(pendingCenterRef.current.nodeId)
        if (targetNode) {
          const container = containerRef.current
          if (container) {
            const { width, height } = container.getBoundingClientRect()
            setViewport(prev => ({
              scale: Math.max(prev.scale, 1.2),
              x: width / 2 - targetNode.x * Math.max(prev.scale, 1.2),
              y: height / 2 - targetNode.y * Math.max(prev.scale, 1.2),
            }))
            setSelectedNodeId(targetNode.id)
          }
        }
        pendingCenterRef.current = null
      }

      // FPS meter — recompute ~2×/sec. setFps only fires on change, so this
      // is the only routine state update from the loop in steady state.
      const now = performance.now()
      const track = fpsTrackRef.current
      track.frames++
      if (track.lastStamp === 0) track.lastStamp = now
      const elapsed = now - track.lastStamp
      if (elapsed >= 500) {
        const measured = Math.round((track.frames * 1000) / elapsed)
        setFps(prev => (prev === measured ? prev : measured))
        track.frames = 0
        track.lastStamp = now
      }

      if (sim.isStable()) {
        setRunning(false)
        return
      }

      frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)
    return () => { if (frameId) cancelAnimationFrame(frameId) }
  }, [running, visibleIds, visibleNodes, selectedNodeId])

  // While hovering a node during a running simulation, re-render at ~10fps so
  // the DOM tooltip tracks the moving node. (Canvas nodes update at 60fps via
  // mutable refs; the tooltip is a React-rendered DOM element that reads
  // node.x/.y at render time.)
  const [, setTooltipTick] = React.useState(0)
  React.useEffect(() => {
    if (!running || !hoveredNodeId) return
    const id = window.setInterval(() => setTooltipTick(t => t + 1), 100)
    return () => window.clearInterval(id)
  }, [running, hoveredNodeId])

  // Seed newly visible nodes at their nearest visible ancestor, then reheat
  const prevVisibleTypes = React.useRef(visibleTypes)
  React.useEffect(() => {
    const prev = prevVisibleTypes.current
    if (prev === visibleTypes) return
    const sim = simRef.current
    if (sim) {
      // Find nodes that just became visible
      for (const node of sim.nodes) {
        const defType = nodeTypeToDefType(node.nodeType)
        if (visibleTypes.has(defType) && !prev.has(defType)) {
          // Seed at nearest visible ancestor
          let ancestorId = node.parentId
          while (ancestorId) {
            const ancestor = sim.getNode(ancestorId)
            if (!ancestor) break
            if (visibleTypes.has(nodeTypeToDefType(ancestor.nodeType))) {
              sim.seedAt(node.id, ancestor.x, ancestor.y)
              break
            }
            ancestorId = ancestor.parentId
          }
        }
      }
      sim.reheat(0.5)
      setRunning(true)
      initialFitDone.current = false
    }
    prevVisibleTypes.current = visibleTypes
  }, [visibleTypes])

  // Reheat when the file filter changes — gives the user visible motion
  // confirming the change registered, and lets the now-visible /
  // newly-hidden subset settle into a layout that reflects the new
  // node population. Unlike type changes, we don't ancestor-seed (files
  // aren't structural containers in the graph) and we don't refit the
  // viewport (the user's pan/zoom should survive a file filter toggle).
  const prevSelectedFiles = React.useRef(selectedFiles)
  React.useEffect(() => {
    const prev = prevSelectedFiles.current
    if (prev === selectedFiles) return
    const sim = simRef.current
    if (sim) {
      sim.reheat(0.3)
      setRunning(true)
    }
    prevSelectedFiles.current = selectedFiles
  }, [selectedFiles])

  // Propagate force param changes to the simulation. This only updates the
  // params; re-energising the layout is the separate concern of
  // `handleForceAdjust` below, so non-param interactions (e.g. dragging a
  // future 2D force field before it commits a value) can keep the sim warm
  // without routing through here.
  const handleParamChange = React.useCallback((patch: Partial<ForceParams>) => {
    setForceParams(prev => {
      const next = { ...prev, ...patch }
      simRef.current?.setParams(next)
      return next
    })
  }, [])

  // Shared "keep the simulation warm while tuning" mechanism. Every force
  // control routes its edits through this (via the control panel) so a
  // parameter change always re-energises the layout — tuning is a live
  // feedback loop, not an edit-then-press-Play workflow. Freezing a layout
  // is a separate, explicit action (Pause / the simulation cooling on its
  // own once edits stop).
  const handleForceAdjust = React.useCallback(() => {
    simRef.current?.nudge(0.3)
    setRunning(true)
  }, [])

  // Non-numeric gravity edits (mode, Band/Topological toggles). These relocate
  // nodes (e.g. tiers <-> rings), so reheat harder than a slider nudge to let
  // the layout re-settle.
  const handleGravityChange = React.useCallback((partial: Partial<ForceParams>) => {
    setForceParams(prev => {
      const next = { ...prev, ...partial }
      simRef.current?.setParams(next)
      return next
    })
    simRef.current?.reheat(0.6)
    setRunning(true)
  }, [])

  // Node drag handlers
  const handleNodeDragStart = React.useCallback((id: string, wx: number, wy: number) => {
    dragNodeRef.current = id
    simRef.current?.pinNode(id, wx, wy)
    simRef.current?.reheat(0.3)
    setRunning(true)
  }, [])

  const handleNodeDragMove = React.useCallback((wx: number, wy: number) => {
    if (dragNodeRef.current) simRef.current?.pinNode(dragNodeRef.current, wx, wy)
  }, [])

  const handleNodeDragEnd = React.useCallback(() => {
    if (dragNodeRef.current) {
      simRef.current?.unpinNode(dragNodeRef.current)
      dragNodeRef.current = null
    }
  }, [])

  // Double-click node: center and zoom to neighbors
  const handleDoubleClickNode = React.useCallback((id: string) => {
    const sim = simRef.current
    const container = containerRef.current
    if (!sim || !container) return
    const node = sim.getNode(id)
    if (!node) return
    const neighborIds = new Set<string>([id])
    for (const edge of sim.edges) {
      if (edge.sourceId === id) neighborIds.add(edge.targetId)
      if (edge.targetId === id) neighborIds.add(edge.sourceId)
    }
    const neighbors = sim.nodes.filter(n => neighborIds.has(n.id))
    const { width, height } = container.getBoundingClientRect()
    setViewport(fitToView(neighbors, width, height, 80))
  }, [])

  // Fit-to-view
  const handleFitToView = React.useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const { width, height } = container.getBoundingClientRect()
    setViewport(fitToView(visibleNodes, width, height))
  }, [visibleNodes])

  // Toggle simulation
  const handleToggleRunning = React.useCallback(() => {
    if (!running) {
      simRef.current?.reheat(0.5)
      setRunning(true)
    } else {
      setRunning(false)
    }
  }, [running])

  // Reheat with a strong kick. `reheat()` now scales its cooling rate to the
  // kick, so a large alpha rearranges the layout *further* without dragging the
  // settle out *longer* — it lands back at rest in the same fixed window.
  const handleReheat = React.useCallback(() => {
    simRef.current?.reheat(2)
    setRunning(true)
  }, [])

  // Type group toggle — turns all types in the group on together, or off
  // together. If any member is currently on, the whole group turns off;
  // if all are off, the whole group turns on.
  const toggleTypeGroup = (types: string[]) => {
    const anyOn = types.some(t => filter.visibleTypes.has(t))
    const next = new Set(filter.visibleTypes)
    if (anyOn) {
      for (const t of types) next.delete(t)
    } else {
      for (const t of types) next.add(t)
    }
    onFilterChange({ ...filter, visibleTypes: next })
  }

  // File filter toggle
  const toggleFile = (file: string) => {
    const next = new Set(filter.selectedFiles)
    if (next.has(file)) next.delete(file)
    else next.add(file)
    onFilterChange({ ...filter, selectedFiles: next })
  }

  // Search toggle — emits to canvas. Search query is globally shared so
  // clearing it on close affects both views (intentional: closing the
  // search bar means "no active search anywhere").
  const toggleSearch = () => {
    if (searchActive) {
      onSearchChange('', false)
    } else {
      onSearchChange(searchQuery, true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  // Pin togglers — emit the new PinState up.
  const togglePinFiles = () => onPinsChange({ ...pins, files: !pins.files })
  const togglePinTypes = () => onPinsChange({ ...pins, types: !pins.types })

  // Right-click on a canvas node — open the context menu at the cursor.
  const handleNodeContextMenu = React.useCallback((nodeId: string, clientX: number, clientY: number) => {
    setContextMenu({ x: clientX, y: clientY, nodeId })
  }, [])

  const closeContextMenu = React.useCallback(() => setContextMenu(null), [])

  // Build the menu items dynamically from the right-clicked node.
  const contextMenuItems = React.useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu || !onShowInTree) return []
    const node = simRef.current?.getNode(contextMenu.nodeId)
    if (!node) return []
    return [{
      label: 'Show in Tree',
      onClick: () => onShowInTree(node.name, nodeTypeToDefType(node.nodeType)),
    }]
  }, [contextMenu, onShowInTree])

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

  // Focused node ID (for keyboard nav)
  const focusedNodeId = focusedIndex >= 0 && focusedIndex < visibleNodes.length
    ? visibleNodes[focusedIndex].id
    : null

  // Cross-view focus: the reconciler in WorkflowCanvas has already
  // expanded the destination filter so the target is visible. We only
  // arrange the visual focus part — set up the center-on-target ref
  // and reheat the simulation if it had stabilized.
  React.useEffect(() => {
    if (!pendingFocus) return
    const { name, defType } = pendingFocus
    const targetNodeType = defTypeToNodeType(defType)
    const sim = simRef.current
    if (sim) {
      const targetNode = sim.nodes.find(n => n.name === name && n.nodeType === targetNodeType)
      if (targetNode) {
        pendingCenterRef.current = { nodeId: targetNode.id }
        if (!running) {
          simRef.current?.reheat(0.1)
          setRunning(true)
        }
      }
    }
    onFocusConsumed()
  }, [pendingFocus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shift key tracking
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'Tab': {
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
            onSearchChange(searchQuery, true)
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
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visibleNodes, focusedNodeId, selectedNodeId, searchActive, searchQuery, onSearchChange, shortcutsOpen, handleFitToView, handleToggleRunning])

  // Findings: process-level FileErrors (catastrophic parser failures)
  // and structured Diagnostics (validator/resolver/parse warnings &
  // errors from `twf parse`'s JSON envelope). Each is partitioned by
  // the file-filter so the header can report the shown/hidden split.
  const errors = ast.errors || []
  const diagnostics = ast.diagnostics || []
  const {
    shownFileErrors,
    hiddenFileErrors,
    shownDiagnostics,
    hiddenDiagnostics,
  } = React.useMemo(() => {
    if (selectedFiles.size === 0) {
      return {
        shownFileErrors: errors,
        hiddenFileErrors: [] as FileError[],
        shownDiagnostics: diagnostics,
        hiddenDiagnostics: [] as Diagnostic[],
      }
    }
    const sFE: FileError[] = []
    const hFE: FileError[] = []
    for (const e of errors) {
      if (selectedFiles.has(e.file)) sFE.push(e)
      else hFE.push(e)
    }
    const sD: Diagnostic[] = []
    const hD: Diagnostic[] = []
    for (const d of diagnostics) {
      // Unstamped diagnostics surface in the shown group so a missing
      // file path can't accidentally hide them. The extension stamps
      // file paths, so this only triggers on adversarial input.
      if (!d.file || selectedFiles.has(d.file)) sD.push(d)
      else hD.push(d)
    }
    return {
      shownFileErrors: sFE,
      hiddenFileErrors: hFE,
      shownDiagnostics: sD,
      hiddenDiagnostics: hD,
    }
  }, [errors, diagnostics, selectedFiles])

  const hasFiles = allFiles.length > 0
  const hasHeaderContent = errors.length > 0 || diagnostics.length > 0
  const noFilesSelected = selectedFiles.size === 0
  const nodeCount = visibleNodes.length
  const edgeCount = visibleEdges.length

  return (
    <div className="graph-view" ref={containerRef}>
      {/* Canvas fills the full viewport beneath the floating overlay */}
      <div className="graph-canvas-area">
        <GraphCanvas
          nodes={visibleNodes}
          edges={visibleEdges}
          viewport={viewport}
          onViewportChange={setViewport}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragMove={handleNodeDragMove}
          onNodeDragEnd={handleNodeDragEnd}
          onDoubleClickNode={handleDoubleClickNode}
          onHoverNode={setHoveredNodeId}
          onSelectNode={setSelectedNodeId}
          onNodeContextMenu={handleNodeContextMenu}
          highlightedNodes={highlightedNodes}
          highlightedEdges={highlightedEdges}
          hoveredNodeId={hoveredNodeId}
          selectedNodeId={selectedNodeId}
          focusedNodeId={focusedNodeId}
          searchMatchIds={visibleMatchIds}
          running={running}
          forceParams={forceParams}
          activeSection={activeSection}
          activeChargeType={activeChargeType}
          activeGravityType={activeGravityType}
          activePullEdge={activePullEdge}
          nodeSummaries={nodeSummaries}
        />
        <GraphHoverTooltip
          hoveredNodeId={hoveredNodeId}
          simRef={simRef}
          visibleEdges={visibleEdges}
          visibleIds={visibleIds}
          viewport={viewport}
          shiftHeld={shiftHeld}
          duplicateGroups={graph.duplicateGroups}
        />
      </div>

      {/* Floating overlay: filter bar + toolbar + errors header */}
      <div className="graph-overlay">
      {/* Shared Filter Bar — identical structure to Tree View */}
      <div className="canvas-header">
        {hasFiles && (
          <>
            <div className={`header-files-section${pins.files ? ' section-pinned' : ''}`}>
              <div className="header-files-row">
                {allFiles.map(file => {
                  const fileName = file.split('/').pop() || file
                  const isSelected = selectedFiles.has(file)
                  const isChanged = recentlyChanged.has(`file:${file}`)
                  const chipClass = [
                    'header-file-tag',
                    noFilesSelected ? 'all-included' : (isSelected ? 'selected' : ''),
                    isChanged ? 'recently-changed' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button key={file} className={chipClass} onClick={() => toggleFile(file)} title={file}>
                      <span className="header-file-icon">📄</span>
                      <span className="header-file-name">{fileName}</span>
                    </button>
                  )
                })}
              </div>
              <PinToggle
                pinned={pins.files}
                onClick={togglePinFiles}
                flashing={overriddenPins.has('files')}
                label="Files"
              />
            </div>
            <div className="header-divider" />
          </>
        )}

        <div className={`header-types-section${pins.types ? ' section-pinned' : ''}`}>
          <div className="header-types-row">
            {VIEW_FILTER_ENTRIES.map(entry => {
              const isActive = entry.types.some(t => visibleTypes.has(t))
              const isChanged = entry.types.some(t => recentlyChanged.has(`type:${t}`))
              const cls = [
                'header-type-tag',
                isActive ? 'active' : '',
                `header-type-${entry.id}`,
                isChanged ? 'recently-changed' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={entry.id}
                  className={cls}
                  onClick={() => toggleTypeGroup([...entry.types])}
                  title={isActive ? `Hide ${entry.label.toLowerCase()}` : `Show ${entry.label.toLowerCase()}`}
                >
                  <span className="header-type-icon">{entry.icon}</span>
                  <span className="header-type-label">{entry.label}</span>
                </button>
              )
            })}
          </div>
          <PinToggle
            pinned={pins.types}
            onClick={togglePinTypes}
            flashing={overriddenPins.has('types')}
            label="Types"
          />
        </div>

        <div className="header-divider" />

        <div className="header-controls-section">
          <div className={`header-search ${searchActive ? 'active' : ''}`}>
            <button className="header-search-toggle" onClick={toggleSearch} title="Search nodes (/)">
              <SearchIcon size={14} />
            </button>
            {searchActive && (
              <input
                ref={searchInputRef}
                className="header-search-input"
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value, true)}
                onKeyDown={e => { if (e.key === 'Escape') toggleSearch() }}
              />
            )}
            {hiddenMatchCount > 0 && (
              <span className="header-search-badge" title={`${hiddenMatchCount} match${hiddenMatchCount !== 1 ? 'es' : ''} hidden by filters`}>
                +{hiddenMatchCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Graph Toolbar — view-specific controls */}
      <div className="graph-toolbar">
        <span className="graph-toolbar-count">
          {nodeCount} node{nodeCount !== 1 ? 's' : ''}, {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
          {running && <span className="graph-toolbar-fps" title="Simulation frames per second">  ·  {fps} fps</span>}
        </span>
        {selectedNodeId && onShowInTree && (() => {
          const node = simRef.current?.getNode(selectedNodeId)
          if (!node) return null
          return (
            <button
              className="graph-toolbar-btn"
              onClick={() => onShowInTree(node.name, nodeTypeToDefType(node.nodeType))}
              title="Show in Tree view"
            >
              Show in Tree
            </button>
          )
        })()}
        <button className="graph-toolbar-btn" onClick={handleFitToView} title="Fit to view (F)">Fit</button>
        <button
          className={`graph-toolbar-btn ${running ? 'active' : ''}`}
          onClick={handleToggleRunning}
          title={running ? 'Pause simulation (Space)' : 'Resume simulation (Space)'}
        >
          {running ? 'Pause' : 'Play'}
        </button>
        <button className="graph-toolbar-btn" onClick={handleReheat} title="Reheat the simulation (strong)">Reheat</button>
      </div>

      {/* Search results dropdown */}
      {visibleMatchIds && visibleMatchIds.size > 0 && searchActive && (
        <div className="graph-search-results">
          {visibleNodes.filter(n => visibleMatchIds.has(n.id)).map(n => (
            <button
              key={n.id}
              className="graph-search-result"
              onClick={() => handleSelectSearchResult(n.id)}
            >
              <span className="graph-search-result-type">{n.nodeType}</span>
              <span className="graph-search-result-name">{n.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Errors header — last element inside the floating overlay */}
      {hasHeaderContent && (
        <GraphErrorsHeader
          shownFileErrors={shownFileErrors}
          hiddenFileErrors={hiddenFileErrors}
          shownDiagnostics={shownDiagnostics}
          hiddenDiagnostics={hiddenDiagnostics}
        />
      )}
      </div>{/* /graph-overlay */}

      {/* Control panel */}
      <GraphControlPanel
        params={forceParams}
        onParamChange={handleParamChange}
        onAdjust={handleForceAdjust}
        onGravityChange={handleGravityChange}
        onActiveSection={setActiveSection}
        onActiveChargeType={setActiveChargeType}
        onActiveGravityType={setActiveGravityType}
        onActivePullEdge={setActivePullEdge}
      />

      {/* Right-click context menu */}
      {contextMenu && contextMenuItems.length > 0 && (
        <GraphContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}

      {/* Shortcuts panel */}
      {shortcutsOpen && (
        <div className="graph-shortcuts-panel">
          <div className="graph-shortcuts-title">
            Keyboard Shortcuts
            <button className="graph-shortcuts-close" onClick={() => setShortcutsOpen(false)}>&times;</button>
          </div>
          <div className="graph-shortcuts-list">
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
  )
}

interface GraphHoverTooltipProps {
  hoveredNodeId: string | null
  simRef: React.RefObject<Simulation | null>
  visibleEdges: { edgeType: string; sourceId: string; targetId: string }[]
  visibleIds: Set<string>
  viewport: Viewport
  shiftHeld: boolean
  duplicateGroups: Map<string, Set<string>>
}

// Strip the kind prefix from a parser metadata field (e.g. 'namespace:ecommerce'
// → 'ecommerce', 'worker:paymentWorker' → 'paymentWorker'). The parser includes
// the kind label so consumers can identify the type of the referenced entity;
// tooltips want the bare name.
function stripKindPrefix(s: string | undefined): string | undefined {
  if (!s) return undefined
  const i = s.indexOf(':')
  return i >= 0 ? s.slice(i + 1) : s
}

function GraphHoverTooltip({ hoveredNodeId, simRef, visibleEdges, visibleIds, viewport, shiftHeld, duplicateGroups }: GraphHoverTooltipProps) {
  if (!hoveredNodeId) return null
  const sim = simRef.current
  if (!sim) return null
  const node = sim.getNode(hoveredNodeId)
  if (!node) return null

  const parentName = node.parentId ? sim.getNode(node.parentId)?.name : undefined
  // Context line — format varies by node type to surface the most useful
  // parent context. Nexus types show their addressing metadata in the
  // `<parent context> · <task queue>` format from the spec.
  let contextLine: string | undefined
  switch (node.nodeType) {
    case 'nexusEndpoint':
      contextLine = [stripKindPrefix(node.namespace), node.queue].filter(Boolean).join(' · ') || undefined
      break
    case 'nexusService':
      contextLine = [stripKindPrefix(node.worker), node.queue].filter(Boolean).join(' · ') || undefined
      break
    case 'nexusOperation':
      contextLine = [parentName, stripKindPrefix(node.worker), node.queue].filter(Boolean).join(' · ') || undefined
      break
    default:
      contextLine = parentName
  }
  // Use the individual DEF_TYPE_CONFIGS entry for the tooltip icon — the
  // per-type icon (★ for service, ☆ for operation, ⌖ for endpoint) is
  // more informative than the group chip icon. DEF_TYPE_CONFIGS still has
  // all 7 entries even though 3 are collapsed into one chip in the filter bar.
  const cfg = DEF_TYPE_CONFIGS.find(c => c.type === nodeTypeToDefType(node.nodeType))
  const fileName = node.sourceFile?.split('/').pop()

  let outgoing = 0, incoming = 0
  for (const e of visibleEdges) {
    if (e.edgeType === 'containment') continue
    if (e.sourceId === hoveredNodeId) outgoing++
    if (e.targetId === hoveredNodeId) incoming++
  }

  // Duplicate-copies indicator: if this definition has more than one
  // node in the graph, show "N copies" so the user knows the highlight
  // they're seeing is intentional ("this is one of several"). Count
  // only sister copies that survive the current filter — a hidden copy
  // isn't a copy from the user's current point of view.
  const sisters = duplicateGroups.get(node.definitionKey)
  const visibleCopies = sisters
    ? Array.from(sisters).filter(id => visibleIds.has(id))
    : [node.id]
  const copyCount = visibleCopies.length
  const copyIndex = copyCount > 1 ? visibleCopies.indexOf(node.id) + 1 : 0

  const [sx, sy] = worldToScreen(viewport, node.x, node.y)

  return (
    <div className="graph-hover-tooltip" style={{ left: sx, top: sy }}>
      <div className="tooltip-identity">
        {cfg && <span className="tooltip-type-icon">{cfg.icon}</span>}
        <span className="tooltip-name">{node.name}</span>
      </div>
      {contextLine && <div className="tooltip-parent">{contextLine}</div>}
      {fileName && <div className="tooltip-file">{fileName}</div>}
      {copyCount > 1 && (
        <div className="tooltip-duplicates" title="This definition is registered on multiple workers. Hovering any copy highlights all copies.">
          copy {copyIndex} of {copyCount}
        </div>
      )}
      {(outgoing > 0 || incoming > 0) && (
        <div className="tooltip-connections">
          {outgoing > 0 && <span className="tooltip-conn-out">→{outgoing}</span>}
          {incoming > 0 && <span className="tooltip-conn-in">←{incoming}</span>}
        </div>
      )}
      <div className="tooltip-direction">{shiftHeld ? 'dependents' : 'dependencies'}</div>
    </div>
  )
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="graph-shortcut-row">
      <kbd className="graph-shortcut-key">{keys}</kbd>
      <span className="graph-shortcut-desc">{desc}</span>
    </div>
  )
}

/**
 * Floating-overlay variant of the errors header used by the Graph view.
 * Renders both kinds of finding side-by-side:
 *   - FileError (catastrophic parser-process failures)
 *   - Diagnostic (structured validator/resolver/parse output) with
 *     severity-aware glyphs and code chips.
 *
 * Layout is more compact than the tree-view header — the overlay is
 * size-constrained (max-height: 30vh) and shares vertical space with
 * the filter bar and toolbar. Body items render inline; the
 * shown/hidden split appears as an in-body label between groups,
 * not as separate ErrorGroup containers.
 */
function GraphErrorsHeader({
  shownFileErrors, hiddenFileErrors,
  shownDiagnostics, hiddenDiagnostics,
}: {
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
  shownDiagnostics: Diagnostic[]
  hiddenDiagnostics: Diagnostic[]
}) {
  const [expanded, setExpanded] = React.useState(true)

  const allDiagnostics = [...shownDiagnostics, ...hiddenDiagnostics]
  const diagErrors = allDiagnostics.filter(d => d.severity === 'error').length
  const diagWarnings = allDiagnostics.filter(d => d.severity === 'warning').length
  const errorCount = shownFileErrors.length + hiddenFileErrors.length + diagErrors
  const warningCount = diagWarnings
  const headerSeverity: 'error' | 'warning' = errorCount > 0 ? 'error' : 'warning'
  const headerIcon = headerSeverity === 'error' ? '\u2717' : '\u26A0'

  const countParts: string[] = []
  if (errorCount > 0) countParts.push(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`)
  if (warningCount > 0) countParts.push(`${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`)
  const countText = countParts.join(', ')

  const shownTotal = shownFileErrors.length + shownDiagnostics.length
  const hiddenTotal = hiddenFileErrors.length + hiddenDiagnostics.length

  const shownErrDiags = shownDiagnostics.filter(d => d.severity === 'error')
  const shownWarnDiags = shownDiagnostics.filter(d => d.severity === 'warning')
  const hiddenErrDiags = hiddenDiagnostics.filter(d => d.severity === 'error')
  const hiddenWarnDiags = hiddenDiagnostics.filter(d => d.severity === 'warning')

  return (
    <div className={`graph-errors-header${headerSeverity === 'warning' ? ' severity-warnings-only' : ''}`}>
      <div className="graph-errors-bar" onClick={() => setExpanded(!expanded)}>
        <span className="block-toggle">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="graph-errors-icon">{headerIcon}</span>
        <span className="graph-errors-title">{countText}</span>
      </div>
      {expanded && (
        <div className="graph-errors-body">
          {shownTotal > 0 && hiddenTotal > 0 && (
            <div className="error-group-label">Shown files ({shownTotal})</div>
          )}
          {shownFileErrors.map((err, i) => (
            <div key={`sfe${i}`} className="graph-error-item">
              <span className="graph-error-file">{err.file.split('/').pop()}</span>
              <pre className="graph-error-msg">{err.stderr || err.error}</pre>
            </div>
          ))}
          {shownErrDiags.map((d, i) => (
            <GraphDiagnosticRow key={`sed${i}`} diagnostic={d} />
          ))}
          {shownWarnDiags.map((d, i) => (
            <GraphDiagnosticRow key={`swd${i}`} diagnostic={d} />
          ))}
          {hiddenTotal > 0 && (
            <>
              <div className="error-group-label">Hidden files ({hiddenTotal})</div>
              {hiddenFileErrors.map((err, i) => (
                <div key={`hfe${i}`} className="graph-error-item">
                  <span className="graph-error-file">{err.file.split('/').pop()}</span>
                  <pre className="graph-error-msg">{err.stderr || err.error}</pre>
                </div>
              ))}
              {hiddenErrDiags.map((d, i) => (
                <GraphDiagnosticRow key={`hed${i}`} diagnostic={d} />
              ))}
              {hiddenWarnDiags.map((d, i) => (
                <GraphDiagnosticRow key={`hwd${i}`} diagnostic={d} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function GraphDiagnosticRow({ diagnostic }: { diagnostic: Diagnostic }) {
  const glyph = diagnostic.severity === 'error' ? '\u2717' : '\u26A0'
  const fileName = diagnostic.file ? diagnostic.file.split('/').pop() : undefined
  const loc = fileName
    ? `${fileName}:${diagnostic.start.line}:${diagnostic.start.column}`
    : undefined
  return (
    <div className={`graph-diagnostic-item diagnostic-item severity-${diagnostic.severity}`}>
      <span className="diagnostic-glyph" aria-hidden="true">{glyph}</span>
      <span className="diagnostic-code">{diagnostic.code}</span>
      <span className="diagnostic-message">{diagnostic.message}</span>
      {loc && <span className="diagnostic-location">{loc}</span>}
    </div>
  )
}
