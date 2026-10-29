// The catalog's taxonomy: what its nodes and edges are, how they look and
// weigh, how they filter. Everything the view knows about the domain comes
// through `ontology` below.

import { createOntology, payloadString, RELATION_DIMENSION } from '@temporal-architect/graph-view'
import type {
  DimensionDescriptor, EdgeStroke, EdgeTypeDefinition, FilterChip, GraphNode, Highlight, HighlightGraph,
  NodeTypeDefinition, OntologySpec, ReadableGraph, ScalarAxis,
} from '@temporal-architect/graph-view'
import type { Campus } from './data'

/** Node axes. `entity` is both the style axis and the allow-list filter. */
export const ENTITY = 'entity'
export const CAMPUS = 'campus'
/** This host's edge axis: which kind of requirement a dependency edge is. */
export const REQUIREMENT = 'requirement'

export type Entity = 'faculty' | 'department' | 'course' | 'lab'
export const ENTITIES: readonly Entity[] = ['faculty', 'department', 'course', 'lab']

export const CAMPUS_LABEL: Record<Campus, string> = { north: 'North campus', south: 'South campus', online: 'Online' }

// Shared horizontal rest band; the vertical bands stack the hierarchy top-down.
const X = { min: 0, max: 420 }

export const NODE_STYLES: Record<Entity, NodeTypeDefinition> = {
  faculty: {
    label: 'Faculty',
    icon: '⌂',
    defaultVisible: false,
    whenHidden: 'ascend',
    summaryKind: 'children',
    color: { light: { fill: '#334155', border: '#0F172A' }, dark: { fill: '#94A3B8', border: '#475569' } },
    size: { r: 22, iconSize: 18 },
    physics: { charge: -900, coreRadius: 90, band: { x: X, y: { min: -340, max: -160 } } },
  },
  department: {
    label: 'Department',
    icon: '▦',
    defaultVisible: true,
    whenHidden: 'ascend',
    summaryKind: 'children',
    color: { light: { fill: '#0F766E', border: '#134E4A' }, dark: { fill: '#2DD4BF', border: '#0F766E' } },
    size: { r: 16, iconSize: 14 },
    physics: { charge: -700, coreRadius: 64, band: { x: X, y: { min: -220, max: 60 } } },
  },
  course: {
    label: 'Course',
    icon: '✎',
    defaultVisible: true,
    whenHidden: 'ascend',
    summaryKind: 'degree',
    color: { light: { fill: '#B45309', border: '#78350F' }, dark: { fill: '#F59E0B', border: '#B45309' } },
    size: { r: 10, iconSize: 11 },
    physics: { charge: -380, coreRadius: 36, band: { x: X, y: { min: 40, max: 400 } } },
  },
  lab: {
    label: 'Lab',
    icon: '⚗',
    defaultVisible: false,
    whenHidden: 'ascend',
    summaryKind: 'degree',
    color: { light: { fill: '#BE185D', border: '#831843' }, dark: { fill: '#F472B6', border: '#BE185D' } },
    size: { r: 7, iconSize: 9 },
    physics: { charge: -180, coreRadius: 20, band: { x: X, y: { min: 260, max: 500 } } },
  },
}

const ABBREVIATIONS: Record<Entity, string> = {
  faculty: 'Fa',
  department: 'Dp',
  course: 'Co',
  lab: 'Lb',
}

const FALLBACK: NodeTypeDefinition = {
  label: 'Unknown',
  icon: '?',
  defaultVisible: false,
  whenHidden: 'ascend',
  summaryKind: 'none',
  color: { light: { fill: '#CBD5E1', border: '#94A3B8' }, dark: { fill: '#CBD5E1', border: '#94A3B8' } },
  size: { r: 8, iconSize: 9 },
  physics: { charge: -200, coreRadius: 24, band: { x: X, y: { min: 40, max: 400 } } },
}

// ── Edges ───────────────────────────────────────────────────────────────────

const CONTAINS: EdgeStroke = {
  color: { light: '#94A3B8', dark: '#64748B' },
  alpha: 0.35,
  dash: [3, 4],
  width: 1,
}
const contains = (id: string, label: string, child: Entity, parent: Entity, strength: number, distance: number): EdgeTypeDefinition => ({
  id,
  label,
  sourceType: child,
  targetType: parent,
  category: 'containment',
  physics: { strength, distance },
  style: CONTAINS,
  tooltip: `${NODE_STYLES[child].label} in ${NODE_STYLES[parent].label}`,
})

export const EDGE_TYPES: readonly EdgeTypeDefinition[] = [
  contains('deptInFaculty', 'Dp→Fa', 'department', 'faculty', 0.35, 520),
  contains('courseInDept', 'Co→Dp', 'course', 'department', 0.5, 200),
  contains('labInCourse', 'Lb→Co', 'lab', 'course', 0.9, 60),
  {
    id: 'prerequisite',
    label: 'Pre',
    sourceType: 'course',
    targetType: 'course',
    category: 'dependency',
    physics: { strength: 0.6, distance: 260 },
    tooltip: 'Must be passed first',
    style: {
      color: { light: '#B45309', dark: '#FBBF24' },
      alpha: 0.8,
      dash: [],
      width: 1.6,
    },
  },
  {
    // Same endpoints as a prerequisite; only the edge's own `requirement` tells them apart.
    id: 'corequisite',
    label: 'Co-req',
    sourceType: 'course',
    targetType: 'course',
    category: 'dependency',
    physics: { strength: 1.2, distance: 120 },
    tooltip: 'Taken in the same term',
    style: {
      color: { light: '#7C3AED', dark: '#C4B5FD' },
      alpha: 0.85,
      dash: [6, 3],
      width: 1.6,
    },
  },
  {
    id: 'recommended',
    label: 'Rec',
    sourceType: 'course',
    targetType: 'course',
    category: 'dependency',
    physics: { strength: 0.2, distance: 420 },
    tooltip: 'Recommended background',
    style: {
      color: { light: '#64748B', dark: '#94A3B8' },
      alpha: 0.5,
      dash: [1, 4],
      width: 1.2,
    },
  },
]

const CONTAINMENT_BY_CHILD: Record<string, string> = { department: 'deptInFaculty', course: 'courseInDept', lab: 'labInCourse' }

/**
 * Containment classifies by the child's tier. A dependency classifies by the
 * edge's own `requirement` alone: the rule must answer for any endpoint pair,
 * because an edge into a hidden course is re-pointed at its department.
 */
function resolveEdgeType(edge: { dimensions: Readonly<Record<string, string>> }, src: string | undefined): string {
  if (edge.dimensions[RELATION_DIMENSION] === 'containment') return CONTAINMENT_BY_CHILD[src ?? ''] ?? 'courseInDept'
  const kind = edge.dimensions[REQUIREMENT]
  return kind === 'corequisite' || kind === 'recommended' ? kind : 'prerequisite'
}

// ── Filter axes ─────────────────────────────────────────────────────────────

const ENTITY_CHIPS: readonly FilterChip[] = [
  {
    id: 'organisation',
    label: 'Organisation',
    icon: NODE_STYLES.faculty.icon,
    tint: 'faculty',
    values: ['faculty', 'department'],
  },
  {
    id: 'course',
    label: 'Courses',
    icon: NODE_STYLES.course.icon,
    tint: 'course',
    values: ['course'],
  },
  {
    id: 'lab',
    label: 'Labs',
    icon: NODE_STYLES.lab.icon,
    tint: 'lab',
    values: ['lab'],
  },
]

const FILTERS: readonly DimensionDescriptor[] = [
  {
    id: ENTITY,
    label: 'Show',
    // An allow-list: nothing selected shows nothing.
    emptyMeans: 'none',
    absentMeans: 'hidden',
    focus: 'always',
    reheat: {
      alpha: 0.5,
      seedRevealed: true,
      refit: true,
      resume: true,
    },
    chipsFor: values => ENTITY_CHIPS.filter(c => c.values.some(v => values.includes(v))),
    labelFor: v => NODE_STYLES[v as Entity]?.label ?? v,
    abbreviationFor: v => ABBREVIATIONS[v as Entity] ?? v.slice(0, 2),
  },
  {
    id: CAMPUS,
    label: 'Campus',
    // Nothing selected shows every campus; faculties and departments have none and always show.
    emptyMeans: 'all',
    absentMeans: 'visible',
    focus: 'whenActive',
    reheat: {
      alpha: 0.3,
      seedRevealed: false,
      refit: false,
      resume: true,
    },
    chipsFor: values => (Object.keys(CAMPUS_LABEL) as Campus[])
      .filter(c => values.includes(c))
      .map(c => ({ id: c, label: CAMPUS_LABEL[c], values: [c] })),
    labelFor: v => CAMPUS_LABEL[v as Campus] ?? v,
    abbreviationFor: v => v.slice(0, 2),
  },
]

// ── Scalars, hover line, highlight ──────────────────────────────────────────

/** `payloadString` reads strings only; credits and level are numbers. */
export function payloadNumber(node: { payload?: Readonly<Record<string, unknown>> }, key: string): number | undefined {
  const v = node.payload?.[key]
  return typeof v === 'number' ? v : undefined
}

function scalarOf(id: string, label: string, tooltip: string, key: string, floor: number): ScalarAxis {
  return {
    id,
    label,
    tooltip,
    compute(graph: ReadableGraph) {
      const raw = new Map<string, number>()
      for (const n of graph.nodes) {
        const v = payloadNumber(n, key)
        if (v !== undefined) raw.set(n.id, v)
      }
      const max = Math.max(floor + 1, ...raw.values())
      return new Map([...raw].map(([id, v]) => [id, (v - floor) / (max - floor)]))
    },
  }
}

const SCALARS: readonly ScalarAxis[] = [
  scalarOf('credits', 'Credits', 'Credit weight, as a share of the heaviest course', 'credits', 0),
  scalarOf('level', 'Level', 'Course level (1xx … 3xx), lowest at 0', 'level', 1),
]

function contextLine(node: GraphNode, parent: GraphNode | undefined): string | undefined {
  const code = payloadString(node, 'code')
  const credits = payloadNumber(node, 'credits')
  switch (node.dimensions[ENTITY]) {
    case 'faculty': return payloadString(node, 'dean')
    case 'department': return [code, parent?.name].filter(Boolean).join(' · ')
    default: return [code, credits !== undefined ? `${credits} cr` : undefined, payloadString(node, 'term')].filter(Boolean).join(' · ')
  }
}

/**
 * A department's highlight is its own teaching: the courses and labs it
 * contains, and whatever those depend on outside it. Everything else keeps
 * the library's walk.
 */
function highlight(active: GraphNode, base: Highlight, graph: HighlightGraph): Highlight {
  if (active.dimensions[ENTITY] !== 'department') return base
  const nodes = new Set(base.nodes)
  for (const n of graph.visibleNodes) {
    if (n.parentId === active.id) nodes.add(n.id)
    else if (n.parentId && graph.getNode(n.parentId)?.parentId === active.id) nodes.add(n.id)
  }
  const members = new Set(nodes)
  for (const e of graph.visibleEdges) {
    if (e.dimensions[RELATION_DIMENSION] === 'dependency' && members.has(e.sourceId)) nodes.add(e.targetId)
  }
  return { nodes }
}

export const spec: OntologySpec = {
  styleDimension: ENTITY,
  styleLabel: 'Entity',
  abbreviations: ABBREVIATIONS,
  styleGroups: [{ id: 'catalog', values: ENTITIES }],
  nodeTypeKeys: ENTITIES,
  filterDimensions: FILTERS,
  nodeStyles: NODE_STYLES,
  edgeTypes: EDGE_TYPES,
  resolveEdgeType,
  scalars: SCALARS,
  contextLine,
  highlight,
  fallbackStyle: FALLBACK,
}

export const ontology = createOntology(spec)
