// This deployment model's node-type entries — the host half of the taxonomy.
//
// The *shapes* these entries fill in are library-owned and live in
// `./taxonomy`; what is here is only the values: which node types this domain
// has, what they are called, how they are drawn and physically weighted. That
// is the direction the dependency has to run. Nothing in the engine imports
// this file — everything resolves through the `Ontology` built at the bottom —
// which is what lets the whole thing move out of the library without the engine
// noticing.
//
// Adding a node type means adding one entry; the record's `Record<NodeType, …>`
// type still enforces completeness.

// Node types in the graph.
//
// Two ladders of four tiers (GRAPH_VIEW.md § Two parallel ladders):
//
//   namespace      — container (main). Holds workers and nexus endpoints.
//   nexusEndpoint  — container (nexus): a routing alias parented to a namespace.
//                    No outgoing edges; the nexus call's edge metadata names
//                    the endpoint that routed it.
//   worker         — host (main). Runs workflows and activities.
//   nexusService   — host (nexus). Exposes a callable API surface.
//   workflow       — orchestrator (main). Runs inside a worker.
//   nexusOperation — orchestrator (nexus). Callable unit of a service; sits on
//                    the call path between caller and backing workflow.
//   activity       — leaf (main). Where work actually happens.
//
// Sizing, physics, and summary behaviour for each type live in
// NODE_TYPE_REGISTRY below.
export type NodeType =
  | 'namespace'
  | 'nexusEndpoint'
  | 'worker'
  | 'nexusService'
  | 'workflow'
  | 'nexusOperation'
  | 'activity'

import { createOntology, payloadString } from '@temporal-architect/graph-view'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from './dimensions'
import type {
  GraphEdge,
  GraphNode,
  Highlight,
  HighlightGraph,
  Ontology,
  OntologySpec,
  NodeTypeDefinition,
  DimensionDescriptor,
  FilterChip,
} from '@temporal-architect/graph-view'
import { ALL_EDGE_TYPES, edgeTypeFor } from './edge-types'

/**
 * A node style plus the two fields that are this domain's own.
 *
 * `ladder` and `tier` name tiers of one specific deployment model, so they are
 * not part of the library shape. They stay declarative rather than being folded
 * into `styleGroups` directly because the grouping below is derived from them,
 * and deriving it here is what keeps the ordering in one place.
 */
/**
 * The axis this domain styles and filters its node types on. The adapter writes
 * it onto every node; nothing in the engine names it.
 */
export const TEMPORAL_TYPE_DIMENSION = 'temporalType'

export interface TemporalNodeTypeDefinition extends NodeTypeDefinition {
  /**
   * The value this type projects onto the kind axis — what the kind chips
   * filter on. The adapter materializes it on each node at build time, so the
   * engine reads it off the node's dimension map like any other axis and never
   * learns that one axis is a function of another.
   */
  defType: string
  /**
   * Which conceptual ladder this node type belongs to.
   * 'main'  — standard deployment path (namespace → worker → workflow/activity)
   * 'nexus' — Nexus addressing path (namespace → endpoint; worker → service → operation)
   */
  ladder: 'main' | 'nexus'
  /**
   * Structural tier within the deployment hierarchy.
   * 'container'    — top-level scope holders
   * 'host'         — hosting / registration tier
   * 'orchestrator' — callable units that orchestrate work
   * 'leaf'         — leaf execution units
   *
   * Read only by the ladder ordering below; sizing and summary kind come from
   * the explicit style fields rather than from switching on this.
   */
  tier: 'container' | 'host' | 'orchestrator' | 'leaf'
}

// The horizontal rest band every type shares by default: what the one global X
// window used to be. Per type now, so a host can give a type its own, and so
// the X axis is the same kind of thing as the Y axis (T22).
const X_WINDOW = { min: 0, max: 380 }

export const NODE_TYPE_REGISTRY: Record<NodeType, TemporalNodeTypeDefinition> = {
  namespace: {
    label: 'Namespace',
    icon: '⧉',
    defType: 'namespaceDef',
    ladder: 'main',
    tier: 'container',
    whenHidden: 'ascend',
    defaultVisible: false,
    color: {
      light: { fill: '#475569', border: '#1E293B' }, // slate-600
      dark:  { fill: '#94A3B8', border: '#475569' }, // slate-400
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -850,
      coreRadius: 85,
      band: { x: X_WINDOW, y: { min: -340, max: -120 } },  // container band (shared with nexusEndpoint)
    },
    summaryKind: 'children',
  },

  nexusEndpoint: {
    label: 'Nexus Endpoint',
    icon: '⌖',
    defType: 'nexusEndpointDef',
    ladder: 'nexus',
    tier: 'container',
    whenHidden: 'ascend',
    defaultVisible: false,
    color: {
      light: { fill: '#9F1239', border: '#4C0519' }, // rose-900 — deep, sits just under namespace
      dark:  { fill: '#BE123C', border: '#881337' }, // rose-700 — lighter on dark
    },
    size: { r: 15, iconSize: 14 },
    physics: {
      charge: -900,
      coreRadius: 64,
      band: { x: X_WINDOW, y: { min: -340, max: -120 } },  // container band aligned with namespace
    },
    summaryKind: 'none',
  },

  worker: {
    label: 'Worker',
    icon: '□',
    defType: 'workerDef',
    ladder: 'main',
    tier: 'host',
    whenHidden: 'ascend',
    defaultVisible: true,
    color: {
      light: { fill: '#94A3B8', border: '#475569' }, // slate-400
      dark:  { fill: '#CBD5E1', border: '#64748B' }, // slate-300
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -770,
      coreRadius: 72,
      band: { x: X_WINDOW, y: { min: -200, max: 120 } },   // host band (shared with nexusService)
    },
    summaryKind: 'children',
  },

  nexusService: {
    label: 'Nexus Service',
    icon: '★',
    defType: 'nexusServiceDef',
    ladder: 'nexus',
    tier: 'host',
    whenHidden: 'ascend',
    defaultVisible: false,
    color: {
      light: { fill: '#DB2777', border: '#831843' }, // pink-600
      dark:  { fill: '#EC4899', border: '#9D174D' }, // pink-500
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -760,
      coreRadius: 54,
      band: { x: X_WINDOW, y: { min: -200, max: 120 } },   // host band aligned with worker
    },
    summaryKind: 'children',
  },

  workflow: {
    label: 'Workflow',
    icon: '⚙⚙',
    defType: 'workflowDef',
    ladder: 'main',
    tier: 'orchestrator',
    whenHidden: 'ascend',
    defaultVisible: true,
    color: {
      light: { fill: '#8B7EC8', border: '#5D4F95' },
      dark:  { fill: '#A89BD8', border: '#6B5BB0' },
    },
    size: { r: 11, iconSize: 12 },
    physics: {
      charge: -360,
      coreRadius: 38,
      band: { x: X_WINDOW, y: { min: 100, max: 460 } },    // orchestrator band (shared with nexusOperation)
    },
    summaryKind: 'degree',
  },

  nexusOperation: {
    label: 'Nexus Operation',
    icon: '☆',
    defType: 'nexusOperationDef',
    ladder: 'nexus',
    tier: 'orchestrator',
    whenHidden: 'splice',
    defaultVisible: false,
    color: {
      light: { fill: '#F9A8D4', border: '#BE185D' },
      dark:  { fill: '#F9A8D4', border: '#DB2777' },
    },
    size: { r: 11, iconSize: 12 },
    physics: {
      charge: -560,
      coreRadius: 58,
      band: { x: X_WINDOW, y: { min: 100, max: 460 } },    // orchestrator band aligned with workflow
    },
    summaryKind: 'degree',
  },

  activity: {
    label: 'Activity',
    icon: '⚙',
    defType: 'activityDef',
    ladder: 'main',
    tier: 'leaf',
    whenHidden: 'ascend',
    defaultVisible: false,
    color: {
      light: { fill: '#7CB9E8', border: '#4A8BC2' },
      dark:  { fill: '#7CB9E8', border: '#5DA8DD' },
    },
    size: { r: 8, iconSize: 10 },
    physics: {
      charge: -190,
      coreRadius: 20,
      band: { x: X_WINDOW, y: { min: 170, max: 500 } },
    },
    summaryKind: 'degree',
  },
}

// Short abbreviations for the control-panel labels (charge-map tokens,
// gravity-band rows). Kept here so they stay in sync with the registry when
// node types change.
const SLIDER_ABBREV: Record<NodeType, string> = {
  namespace:      'NS',
  nexusEndpoint:  'Ep',
  worker:         'Wk',
  nexusService:   'Nx',
  workflow:       'Wf',
  nexusOperation: 'Op',
  activity:       'Act',
}

/**
 * The short label used in the control panel for a node type, e.g. 'NS', 'Ep',
 * 'Wk'. The old hierarchical 'L1'/'L1.5' level prefix has been dropped — the
 * level numbering carried no meaning the user could act on, and the bands /
 * colours already convey the hierarchy.
 */
export function sliderLabelFor(t: NodeType): string {
  return SLIDER_ABBREV[t]
}

/** Ordered list of all node types (declaration order = top-of-hierarchy first). */
export const ALL_NODE_TYPES: NodeType[] = [
  'namespace',
  'nexusEndpoint',
  'worker',
  'nexusService',
  'workflow',
  'nexusOperation',
  'activity',
]

// Per-ladder, top-to-bottom ordering, derived from each type's tier. Consumers
// that lay types out by family + hierarchy (e.g. the gravity band plot's columns)
// read these instead of hardcoding the order, so a registry change reflows them.
const TIER_RANK: Record<TemporalNodeTypeDefinition['tier'], number> = {
  container: 0, host: 1, orchestrator: 2, leaf: 3,
}
const byTier = (a: NodeType, b: NodeType) =>
  TIER_RANK[NODE_TYPE_REGISTRY[a].tier] - TIER_RANK[NODE_TYPE_REGISTRY[b].tier]

/** Main deployment ladder (namespace → worker → workflow → activity), tier-ordered. */
export const MAIN_LADDER: NodeType[] = ALL_NODE_TYPES.filter(t => NODE_TYPE_REGISTRY[t].ladder === 'main').sort(byTier)
/** Nexus ladder (endpoint → service → operation), tier-ordered. */
export const NEXUS_LADDER: NodeType[] = ALL_NODE_TYPES.filter(t => NODE_TYPE_REGISTRY[t].ladder === 'nexus').sort(byTier)

// The style a node gets when its key is not in the registry. Impossible today —
// the key space is closed — but the seam exists to open it, and the alternative
// to a declared fallback is a TypeError inside the draw loop, where nothing
// catches it and the canvas simply stops repainting. Deliberately neutral: grey,
// small, no glyph, so an unstyled node reads as "unrecognized" rather than
// impersonating a real type.
const FALLBACK_NODE_STYLE: TemporalNodeTypeDefinition = {
  label: 'Unknown',
  icon: '?',
  defType: 'unknownDef',
  ladder: 'main',
  tier: 'leaf',
  whenHidden: 'ascend',
  defaultVisible: false,
  color: {
    light: { fill: '#CBD5E1', border: '#94A3B8' },
    dark:  { fill: '#CBD5E1', border: '#94A3B8' },
  },
  size: { r: 10, iconSize: 11 },
  physics: {
    charge: -300,
    coreRadius: 30,
    band: { x: X_WINDOW, y: { min: 100, max: 460 } },
  },
  summaryKind: 'none',
}

/**
 * The taxonomy this build ships with. Everything domain-specific about the graph
 * is reachable from here, which is what makes it the thing a later unit moves
 * out wholesale — consumers already resolve through the container rather than
 * importing the registry.
 */
/**
 * The two axes this domain filters on, and their policies.
 *
 * **Order is meaningful**: it is the default filter chain, left to right, so it
 * has to match the bar the product already shipped — files first, then kinds.
 *
 * Every field below is a behaviour that used to be a hardcoded branch in
 * `computeVisibleGraph`, `reconcile.ts` or `useSimulationLoop`. They are written
 * out per axis rather than shared, because the two axes disagree on all three
 * policies and a `for (const dim of dims)` loop over a shared rule silently
 * flattens them (T7, T8, T9).
 */
// The chip grouping for the kind axis, lifted from the theme's
// VIEW_FILTER_ENTRIES shape so the bar does not need to import the theme.
const VIEW_FILTER_CHIPS: readonly FilterChip[] = [
  { id: 'namespaceDef', label: 'Namespaces', icon: NODE_TYPE_REGISTRY.namespace.icon, tint: 'namespace', values: ['namespaceDef'] },
  { id: 'workerDef', label: 'Workers', icon: NODE_TYPE_REGISTRY.worker.icon, tint: 'worker', values: ['workerDef'] },
  // The group wears the operation's light pink: the three deepest palette
  // extremes stay reserved for per-node accents, and the group chip sits softer.
  { id: 'nexus', label: 'Nexus', icon: NODE_TYPE_REGISTRY.nexusEndpoint.icon, tint: 'nexusOperation',
    values: ['nexusEndpointDef', 'nexusServiceDef', 'nexusOperationDef'] },
  { id: 'workflowDef', label: 'Workflows', icon: NODE_TYPE_REGISTRY.workflow.icon, tint: 'workflow', values: ['workflowDef'] },
  { id: 'activityDef', label: 'Activities', icon: NODE_TYPE_REGISTRY.activity.icon, tint: 'activity', values: ['activityDef'] },
]

const KIND_ABBREV: Record<string, string> = Object.fromEntries(
  ALL_NODE_TYPES.map(t => [NODE_TYPE_REGISTRY[t].defType, SLIDER_ABBREV[t]]),
)

const FILTER_DIMENSIONS: DimensionDescriptor[] = [
  {
    id: SOURCE_FILE_DIMENSION,
    label: 'File',
    // Quiet neutral tags, as an origin reads; the kind axis below wears the
    // tinted chips (D67).
    presentation: 'tag',
    // Empty shows everything — the opposite of the axis above, and deliberate:
    // adding the first file chip while the filter is off would otherwise
    // activate the filter and hide every other file (T7).
    emptyMeans: 'all',
    // A node with no source file stays visible under any file filter.
    absentMeans: 'visible',
    // The consequence of `emptyMeans: 'all'`: adding the first value NARROWS
    // from everything to one thing, so expanding to reveal a focus target would
    // hide everything else. Only expand an already-active selection (T8).
    focus: 'whenActive',
    // Not structural — no ancestor seed, and no refit so the user's pan/zoom
    // survives. `resume` is still true: dropping it is the specific mistake T9
    // warns about, and it leaves the canvas frozen after every file toggle.
    reheat: { alpha: 0.3, seedRevealed: false, refit: false, resume: true },
    // One chip per file, in whatever order the graph yielded them.
    chipsFor: values => values.map(v => ({
      id: v,
      label: v.split('/').pop() ?? v,
      // The full path: the label is only the basename, and two files with the
      // same basename in different directories are otherwise identical chips.
      tooltip: v,
      icon: '\u{1F4C4}',
      values: [v],
    })),
    labelFor: v => v.split('/').pop() ?? v,
    abbreviationFor: v => (v.split('/').pop() ?? v).slice(0, 2),
  },
  {
    id: DEF_TYPE_DIMENSION,
    label: 'Kind',
    // Empty hides everything: the chips are an allow-list.
    emptyMeans: 'none',
    // Unreachable in practice — the taxonomy's fallback style gives every node
    // a defType — but an axis has to answer, and the restrictive answer matches
    // this axis's empty semantics.
    absentMeans: 'hidden',
    // Adding a kind to an allow-list only ever widens what is visible, so
    // focusing can always expand it.
    focus: 'always',
    // Structural: revealing a kind can introduce nodes with no on-screen
    // history, so they are seeded at their nearest visible ancestor before the
    // reheat, and the camera refits to the new extent.
    reheat: { alpha: 0.5, seedRevealed: true, refit: true, resume: true },
    // Five chips over seven filter keys: the three nexus kinds share one. That
    // folding is the domain choice this hook exists for.
    chipsFor: () => VIEW_FILTER_CHIPS,
    labelFor: v => v,
    // A kind is a type's projection, so it abbreviates as the type does. Two
    // characters of the kind's own name collided ("wo" for two kinds, "ne" for
    // three), which left push/pull tokens on this axis indistinguishable. A
    // kind this registry does not know keeps the two-character fallback.
    abbreviationFor: v => KIND_ABBREV[v] ?? v.slice(0, 2),
  },
]

// Strip the kind prefix from a parser metadata field ('worker:paymentWorker'
// → 'paymentWorker'): the parser includes the kind label so consumers can
// identify the referenced entity; the hover box wants the bare name.
function stripKindPrefix(s: string | undefined): string | undefined {
  if (!s) return undefined
  const i = s.indexOf(':')
  return i >= 0 ? s.slice(i + 1) : s
}

/**
 * The hover box's context line (D59, B35). The nexus values show their
 * addressing metadata — `<parent context> · <task queue>` per the spec — read
 * from this domain's own payload keys, which the library never learns; every
 * other value shows its parent's name.
 */
function contextLineFor(node: GraphNode, parent: GraphNode | undefined): string | undefined {
  const parentName = parent?.name
  const queue = payloadString(node, 'queue')
  const hostWorker = payloadString(node, 'worker')
  switch (node.dimensions[TEMPORAL_TYPE_DIMENSION]) {
    case 'nexusEndpoint':
      // The namespace is the endpoint's containment parent; the queue is
      // intrinsic display metadata.
      return [parentName, queue].filter(Boolean).join(' · ') || undefined
    case 'nexusService':
      return [stripKindPrefix(hostWorker), queue].filter(Boolean).join(' · ') || undefined
    case 'nexusOperation':
      return [parentName, stripKindPrefix(hostWorker), queue].filter(Boolean).join(' · ') || undefined
    default:
      return parentName
  }
}

/**
 * The highlight for an active node (D59). An endpoint's highlight follows its
 * routing metadata — every edge whose payload names it, and their visible
 * ends — instead of the dependency walk; a service's widens the walk with the
 * endpoints fronting its operations (the parser's nexusRoute edges, reached
 * through the service's operation children rather than re-derived from
 * (namespace, queue)); every other value takes the walk as it is.
 */
function highlightFor(active: GraphNode, base: Highlight, graph: HighlightGraph): Highlight {
  const value = active.dimensions[TEMPORAL_TYPE_DIMENSION]
  if (value === 'nexusEndpoint') {
    const nodes = new Set<string>([active.id])
    const edges = new Set<string>()
    if (active.parentId && graph.visibleIds.has(active.parentId)) nodes.add(active.parentId)
    for (const edge of graph.visibleEdges) {
      // The parser writes the endpoint's node id into the routing metadata.
      if (payloadString(edge, 'nexusEndpoint') === active.id) {
        edges.add(edge.id)
        if (graph.visibleIds.has(edge.sourceId)) nodes.add(edge.sourceId)
        if (graph.visibleIds.has(edge.targetId)) nodes.add(edge.targetId)
      }
    }
    return { nodes, edges }
  }
  if (value === 'nexusService') {
    const nodes = new Set(base.nodes)
    const operationIds = new Set<string>()
    for (const n of graph.visibleNodes) {
      if (n.dimensions[TEMPORAL_TYPE_DIMENSION] === 'nexusOperation' && n.parentId === active.id) operationIds.add(n.id)
    }
    for (const edge of graph.visibleEdges) {
      // Resolved from the target node, not from a copy cached on the edge:
      // graduation re-points edges, and a cached endpoint type survives the
      // re-pointing while being wrong about it.
      if (graph.getNode(edge.targetId)?.dimensions[TEMPORAL_TYPE_DIMENSION] !== 'nexusEndpoint') continue
      if (!operationIds.has(edge.sourceId)) continue
      if (graph.visibleIds.has(edge.targetId)) {
        nodes.add(edge.targetId)
        const ep = graph.getNode(edge.targetId)
        if (ep?.parentId && graph.visibleIds.has(ep.parentId)) nodes.add(ep.parentId)
      }
    }
    return { nodes }
  }
  return base
}

/**
 * This domain's taxonomy, as a spec: exported so a variant can be built from it
 * (`createOntology({ ...DEFAULT_ONTOLOGY_SPEC, … })`) rather than by spreading
 * the built container, whose closures would still read these fields.
 */
export const DEFAULT_ONTOLOGY_SPEC: OntologySpec = {
  styleDimension: TEMPORAL_TYPE_DIMENSION,
  styleLabel: 'Type',
  abbreviations: SLIDER_ABBREV,
  // The two ladders, as presentation grouping. A control surface lays the main
  // deployment path out in one run and the nexus addressing path in another.
  styleGroups: [
    { id: 'main', values: MAIN_LADDER },
    { id: 'nexus', values: NEXUS_LADDER },
  ],
  nodeTypeKeys: ALL_NODE_TYPES,
  filterDimensions: FILTER_DIMENSIONS,
  nodeStyles: NODE_TYPE_REGISTRY,
  edgeTypes: ALL_EDGE_TYPES,
  resolveEdgeType: edgeTypeFor,
  // The built-in scalars (reach, degree, depth) suffice for this domain today.
  scalars: [],
  contextLine: contextLineFor,
  highlight: highlightFor,
  // Two graduated edges on one pair: the one carrying routing metadata
  // survives, in either edge order, so an endpoint's highlight still finds
  // the edge it routed. Every payload this host writes on a dependency edge
  // is that metadata, so "carries a payload" is the whole test (D60, D66).
  collapse: (kept, candidate) => {
    const carries = (e: GraphEdge) => e.payload !== undefined && Object.keys(e.payload).length > 0
    return carries(candidate) && !carries(kept) ? candidate : kept
  },
  fallbackStyle: FALLBACK_NODE_STYLE,
}

export const DEFAULT_ONTOLOGY: Ontology = createOntology(DEFAULT_ONTOLOGY_SPEC)
