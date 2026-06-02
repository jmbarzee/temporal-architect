// Central node-type registry.
//
// All per-node-type metadata lives here. Adding a new node type means
// adding one entry to NODE_TYPE_REGISTRY; the type system enforces
// completeness because the record is typed Record<NodeType, NodeTypeDefinition>.
//
// Groups that consume this registry:
//   Group 2 — physics (simulation.ts, GraphControlPanel.tsx)
//   Group 3 — visual  (GraphCanvas.tsx, model.ts, GraphView.tsx, build.ts)
//   Group 4 — theme + filter (temporal-theme.tsx, GraphView.tsx)
//   Group 5 — CSS (index.css replaced by runtime-emitted style block)

import type { NodeType } from './model'

export interface NodeTypeDefinition {
  // --- Identity ---
  /** Display name, e.g. "Nexus Endpoint". */
  label: string
  /** Single glyph shown inside the canvas node and in tree-view chips. */
  icon: string
  /**
   * AST def-type key used by the visibility filter and tree-view sort.
   * Nexus operations and endpoints use synthetic keys
   * ('nexusOperationDef', 'nexusEndpointDef') because they live
   * nested inside their parent's AST node rather than as top-level
   * definitions.
   */
  defType: string
  /**
   * Which conceptual ladder this node type belongs to.
   * 'main'  — standard Temporal deployment path (namespace → worker → workflow/activity)
   * 'nexus' — Nexus addressing path (namespace → endpoint; worker → service → operation)
   *
   * Currently docs-only: not consumed by any layout logic in this revision.
   * Introduced as a stable field so a future X-axis separation feature can
   * read it without a schema change.
   */
  ladder: 'main' | 'nexus'
  /**
   * Structural tier within the deployment hierarchy.
   * 'container'    — top-level scope holders (namespace, nexusEndpoint)
   * 'host'         — hosting / registration tier (worker, nexusService)
   * 'orchestrator' — callable units that orchestrate work (workflow, nexusOperation)
   * 'leaf'         — leaf execution units (activity)
   *
   * Registry-private this revision: consumers derive sizing and summary
   * kind from the explicit registry fields rather than switching on tier.
   */
  tier: 'container' | 'host' | 'orchestrator' | 'leaf'
  /**
   * Whether this type is visible by default when the graph first loads.
   * Mirrors DEF_TYPE_CONFIGS[].defaultOn in temporal-theme.tsx.
   */
  defaultVisible: boolean

  // --- Visual ---
  color: {
    /** Canvas fill colour (light theme). */
    fill: string
    /** Canvas border colour (light theme), ~3 stops darker than fill. */
    border: string
    /** Fill override for dark theme. Omitted when same as light fill. */
    fillDark?: string
    /** Border override for dark theme. Omitted when same as light border. */
    borderDark?: string
    /**
     * CSS variable name stem.
     * Generates --color-<cssVarSuffix> and --color-<cssVarSuffix>-border
     * in the runtime style block (Group 5).
     */
    cssVarSuffix: string
  }
  size: {
    /** Circle radius in world units. Hit-test radius = r + 4. */
    r: number
    /** Font size for the icon glyph (px). */
    iconSize: number
  }

  // --- Physics ---
  physics: {
    /**
     * Default repulsion charge. Negative = repulsion. These are the
     * DEFAULT_PARAMS values the user tunes at runtime via the control panel.
     */
    charge: number
    /**
     * Default core radius (charge softening, as a length). A pair of nodes
     * softens its charge by the squared average of the two endpoints'
     * effective core radii (`coreRadiusMultiplier × coreRadius`), added to d².
     * Tuned at runtime on the PUSH charge map. Larger = gentler, wider plateau.
     */
    coreRadius: number
    /**
     * Default Y band where this node type feels zero gravity.
     * Negative Y = top of canvas. The simulation places nodes inside their
     * band on creation so the hierarchy is visible immediately.
     */
    yBand: { min: number; max: number }
  }

  // --- Summary ---
  /**
   * Which summary strategy to use in computeGraphNodeSummary.
   *   'containerCount'    — count contained workers + endpoints (namespace)
   *   'hostRegistrations' — count contained wf / act / nexus ops (worker, nexusService)
   *   'degree'            — count incoming + outgoing dependency edges
   *   'none'              — no summary (nexusEndpoint)
   */
  summaryKind: 'containerCount' | 'hostRegistrations' | 'degree' | 'none'
}

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeDefinition> = {
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

/** Look up the registry entry for a node type. */
export function definitionFor(t: NodeType): NodeTypeDefinition {
  return NODE_TYPE_REGISTRY[t]
}
