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
//   namespace      — L1 container. Holds workers and nexus endpoints.
//   nexusEndpoint  — L1.5 top-level routing alias parented to a namespace.
//                    No outgoing edges; the nexus call's edge metadata names
//                    the endpoint that routed it.
//   worker         — L2 hosting tier. Runs workflows and activities.
//   nexusService   — L2 nexus hosting tier. Exposes a callable API surface.
//   workflow       — L3 orchestrator. Runs inside a worker.
//   nexusOperation — L3 nexus orchestrator. Callable unit of a service;
//                    sits on the call path between caller and backing workflow.
//   activity       — L4 leaf. Where work actually happens.
//
// Sizing, physics, and summary behaviour for each type live in the
// central NODE_TYPE_REGISTRY in graph/node-types.ts.
export type NodeType =
  | 'namespace'
  | 'nexusEndpoint'
  | 'worker'
  | 'nexusService'
  | 'workflow'
  | 'nexusOperation'
  | 'activity'

import { createOntology } from '../graph/ontology'
import type { Ontology } from '../graph/ontology'
import type { NodeTypeDefinition } from '../graph/taxonomy'
import type { DimensionDescriptor, FilterChip } from '../graph/dimension'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../graph/dimension'
import { ALL_EDGE_TYPES, edgeTypeFor } from './edge-types'
import { TEMPORAL_TYPE_DIMENSION } from './build'

/**
 * A node style plus the two fields that are this domain's own.
 *
 * `ladder` and `tier` name tiers of one specific deployment model, so they are
 * not part of the library shape. They stay declarative rather than being folded
 * into `styleGroups` directly because the grouping below is derived from them,
 * and deriving it here is what keeps the ordering in one place.
 */
export interface TemporalNodeTypeDefinition extends NodeTypeDefinition {
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

export const NODE_TYPE_REGISTRY: Record<NodeType, TemporalNodeTypeDefinition> = {
  namespace: {
    label: 'Namespace',
    icon: '⧉',
    defType: 'namespaceDef',
    ladder: 'main',
    tier: 'container',
    defaultVisible: false,
    color: {
      fill:       '#475569',  // slate-600
      border:     '#1E293B',
      fillDark:   '#94A3B8',  // slate-400
      borderDark: '#475569',
      cssVarSuffix: 'namespace',
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -850,
      coreRadius: 85,
      yBand:  { min: -340, max: -120 },  // container band (shared with nexusEndpoint)
    },
    summaryKind: 'containerCount',
  },

  nexusEndpoint: {
    label: 'Nexus Endpoint',
    icon: '⌖',
    defType: 'nexusEndpointDef',
    ladder: 'nexus',
    tier: 'container',
    defaultVisible: false,
    color: {
      fill:       '#9F1239',  // rose-900 — deep, sits just under namespace
      border:     '#4C0519',
      fillDark:   '#BE123C',  // rose-700 — lighter on dark
      borderDark: '#881337',
      cssVarSuffix: 'nexus-endpoint',
    },
    size: { r: 15, iconSize: 14 },
    physics: {
      charge: -900,
      coreRadius: 64,
      yBand:  { min: -340, max: -120 },  // container band aligned with namespace
    },
    summaryKind: 'none',
  },

  worker: {
    label: 'Worker',
    icon: '□',
    defType: 'workerDef',
    ladder: 'main',
    tier: 'host',
    defaultVisible: true,
    color: {
      fill:       '#94A3B8',  // slate-400
      border:     '#475569',
      fillDark:   '#CBD5E1',  // slate-300
      borderDark: '#64748B',
      cssVarSuffix: 'worker',
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -770,
      coreRadius: 72,
      yBand:  { min: -200, max: 120 },   // host band (shared with nexusService)
    },
    summaryKind: 'hostRegistrations',
  },

  nexusService: {
    label: 'Nexus Service',
    icon: '★',
    defType: 'nexusServiceDef',
    ladder: 'nexus',
    tier: 'host',
    defaultVisible: false,
    color: {
      fill:       '#DB2777',  // pink-600
      border:     '#831843',
      fillDark:   '#EC4899',  // pink-500
      borderDark: '#9D174D',
      cssVarSuffix: 'nexus-service',
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -760,
      coreRadius: 54,
      yBand:  { min: -200, max: 120 },   // host band aligned with worker
    },
    summaryKind: 'hostRegistrations',
  },

  workflow: {
    label: 'Workflow',
    icon: '⚙⚙',
    defType: 'workflowDef',
    ladder: 'main',
    tier: 'orchestrator',
    defaultVisible: true,
    color: {
      fill:       '#8B7EC8',
      border:     '#5D4F95',
      fillDark:   '#A89BD8',
      borderDark: '#6B5BB0',
      cssVarSuffix: 'workflow',
    },
    size: { r: 11, iconSize: 12 },
    physics: {
      charge: -360,
      coreRadius: 38,
      yBand:  { min: 100, max: 460 },    // orchestrator band (shared with nexusOperation)
    },
    summaryKind: 'degree',
  },

  nexusOperation: {
    label: 'Nexus Operation',
    icon: '☆',
    defType: 'nexusOperationDef',
    ladder: 'nexus',
    tier: 'orchestrator',
    defaultVisible: false,
    color: {
      fill:       '#F9A8D4',
      border:     '#BE185D',
      borderDark: '#DB2777',
      cssVarSuffix: 'nexus-operation',
    },
    size: { r: 11, iconSize: 12 },
    physics: {
      charge: -560,
      coreRadius: 58,
      yBand:  { min: 100, max: 460 },    // orchestrator band aligned with workflow
    },
    summaryKind: 'degree',
  },

  activity: {
    label: 'Activity',
    icon: '⚙',
    defType: 'activityDef',
    ladder: 'main',
    tier: 'leaf',
    defaultVisible: false,
    color: {
      fill:       '#7CB9E8',
      border:     '#4A8BC2',
      borderDark: '#5DA8DD',
      cssVarSuffix: 'activity',
    },
    size: { r: 8, iconSize: 10 },
    physics: {
      charge: -190,
      coreRadius: 20,
      yBand:  { min: 170, max: 500 },
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
  defaultVisible: false,
  color: {
    fill: '#CBD5E1',
    border: '#94A3B8',
    cssVarSuffix: 'unknown',
  },
  size: { r: 10, iconSize: 11 },
  physics: {
    charge: -300,
    coreRadius: 30,
    yBand: { min: 100, max: 460 },
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
  { id: 'namespaceDef', label: 'Namespaces', icon: NODE_TYPE_REGISTRY.namespace.icon, values: ['namespaceDef'] },
  { id: 'workerDef', label: 'Workers', icon: NODE_TYPE_REGISTRY.worker.icon, values: ['workerDef'] },
  { id: 'nexus', label: 'Nexus', icon: NODE_TYPE_REGISTRY.nexusEndpoint.icon,
    values: ['nexusEndpointDef', 'nexusServiceDef', 'nexusOperationDef'] },
  { id: 'workflowDef', label: 'Workflows', icon: NODE_TYPE_REGISTRY.workflow.icon, values: ['workflowDef'] },
  { id: 'activityDef', label: 'Activities', icon: NODE_TYPE_REGISTRY.activity.icon, values: ['activityDef'] },
]

const FILTER_DIMENSIONS: DimensionDescriptor[] = [
  {
    id: SOURCE_FILE_DIMENSION,
    label: 'File',
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
    abbreviationFor: v => v.slice(0, 2),
  },
]

export const DEFAULT_ONTOLOGY: Ontology = createOntology({
  styleDimension: TEMPORAL_TYPE_DIMENSION,
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
  resolveEdgeType: (edge, src, tgt) =>
    edgeTypeFor(edge, src.dimensions[TEMPORAL_TYPE_DIMENSION], tgt.dimensions[TEMPORAL_TYPE_DIMENSION]),
  fallbackStyle: FALLBACK_NODE_STYLE,
})
