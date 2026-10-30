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
  NodeStyle,
  ResolvedNodeStyle,
  DimensionDescriptor,
  FilterChip,
} from '@temporal-architect/graph-view'
import { ALL_EDGE_TYPES, edgeTypeFor } from './edge-types'

/**
 * The axis this domain styles and filters its node types on. The adapter writes
 * it onto every node; nothing in the engine names it.
 */
export const TEMPORAL_TYPE_DIMENSION = 'temporalType'

/**
 * A node style plus the fields that are this domain's own: the kind the type
 * projects onto, the two tiers of the deployment model it sits on, and whether
 * its kind is selected when the view first opens. The library reads none of
 * them; it reaches the style through the `Ontology`.
 */
export interface TemporalNodeStyle extends NodeStyle {
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
   * Read only by the static golden; sizing and summary kind come from the
   * explicit style fields rather than from switching on this.
   */
  tier: 'container' | 'host' | 'orchestrator' | 'leaf'
  /**
   * Whether this type's kind is selected when the view first opens: the kind
   * axis's initial selection (`DEFAULT_KINDS`) is the kinds of the types that
   * say so.
   */
  defaultVisible: boolean
}

// The horizontal rest band every type shares by default: what the one global X
// window used to be. Per type now, so a host can give a type its own, and so
// the X axis is the same kind of thing as the Y axis (T22).
const X_WINDOW = { min: 0, max: 380 }

// A registry entry: the style less the id its position gives it, and with every
// field the library would default written out — this domain declares each one
// per type, and what reads the registry (the theme, the static golden) takes
// them as given instead of resolving them.
type RegistryEntry = Omit<ResolvedNodeStyle, 'id'> & Pick<TemporalNodeStyle, 'defType' | 'ladder' | 'tier' | 'defaultVisible'>

export const NODE_TYPE_REGISTRY: Record<NodeType, RegistryEntry> = {
  namespace: {
    label: 'Namespace',
    abbreviation: 'NS',
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
    abbreviation: 'Ep',
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
    abbreviation: 'Wk',
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
    abbreviation: 'Nx',
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
    abbreviation: 'Wf',
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
    abbreviation: 'Op',
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
    abbreviation: 'Act',
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

/**
 * The short label used in the control panel for a node type, e.g. 'NS', 'Ep',
 * 'Wk'. The old hierarchical 'L1'/'L1.5' level prefix has been dropped — the
 * level numbering carried no meaning the user could act on, and the bands /
 * colours already convey the hierarchy.
 */
export function sliderLabelFor(t: NodeType): string {
  return NODE_TYPE_REGISTRY[t].abbreviation
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

/**
 * The kinds selected when the view first opens: the projection of every type
 * whose entry says it is visible by default. Declared once; the kind axis's
 * `initialSelection` returns it.
 */
export const DEFAULT_KINDS: string[] = ALL_NODE_TYPES
  .filter(t => NODE_TYPE_REGISTRY[t].defaultVisible)
  .map(t => NODE_TYPE_REGISTRY[t].defType)

// The style a node gets when its key is not in the registry. Impossible today —
// the key space is closed — but the seam exists to open it, and the alternative
// to a declared fallback is a TypeError inside the draw loop, where nothing
// catches it and the canvas simply stops repainting. Deliberately neutral: grey,
// small, no glyph, so an unstyled node reads as "unrecognized" rather than
// impersonating a real type.
const FALLBACK_NODE_STYLE: Omit<TemporalNodeStyle, 'id'> = {
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
 * An axis declares its id, its label and what an empty selection means; every
 * other policy follows from that, and an axis writes one out only where it
 * answers differently. The two axes want opposite answers, which is why each is
 * declared on its own: the file axis narrows (empty shows everything), the kind
 * axis is an allow-list (empty hides everything).
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
  ALL_NODE_TYPES.map(t => [NODE_TYPE_REGISTRY[t].defType, NODE_TYPE_REGISTRY[t].abbreviation]),
)

const FILTER_DIMENSIONS: DimensionDescriptor[] = [
  {
    id: SOURCE_FILE_DIMENSION,
    label: 'File',
    // Quiet neutral tags, as an origin reads; the kind axis below wears the
    // tinted chips (D67).
    presentation: 'tag',
    // Empty shows everything: adding the first file chip while the filter is
    // off would otherwise activate the filter and hide every other file (T7).
    // A narrowing axis's defaults — a node with no file stays visible, a focus
    // expands only an active selection, a change reheats in place and keeps the
    // user's pan and zoom — are exactly the policies this axis wants.
    emptyMeans: 'all',
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
    // Empty hides everything: the chips are an allow-list. An allow-list's
    // defaults — an absent kind hidden, a focus always expanding, a structural
    // reheat that seeds, refits and resumes, a label that is the kind itself —
    // are exactly the policies this axis wants.
    emptyMeans: 'none',
    // Five chips over seven filter keys: the three nexus kinds share one. That
    // folding is the domain choice this hook exists for.
    chipsFor: () => VIEW_FILTER_CHIPS,
    // A kind is a type's projection, so it abbreviates as the type does. Two
    // characters of the kind's own name collided ("wo" for two kinds, "ne" for
    // three), which left push/pull tokens on this axis indistinguishable. A
    // kind this registry does not know keeps the two-character fallback.
    abbreviationFor: v => KIND_ABBREV[v] ?? v.slice(0, 2),
    // Not every kind: the default view shows workers and workflows.
    initialSelection: () => DEFAULT_KINDS,
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
  // Declaration order is top of the hierarchy first.
  values: ALL_NODE_TYPES.map(t => ({ id: t, ...NODE_TYPE_REGISTRY[t] })),
  filterDimensions: FILTER_DIMENSIONS,
  edgeTypes: ALL_EDGE_TYPES,
  classifyEdge: edgeTypeFor,
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
