// The catalog's taxonomy: what its nodes and edges are, how they look and
// weigh, how they filter. Everything the view knows about the domain comes
// through `ontology` below.

import { createOntology, isContainment, payloadNumber, payloadString } from '@temporal-architect/graph-view'
import type {
  DimensionDescriptor, EdgeStroke, EdgeType, FilterChip, GraphEdge, GraphNode, Highlight, HighlightGraph,
  NodeStyle, OntologySpec, ReadableGraph, ScalarAxis,
} from '@temporal-architect/graph-view'
import type { Campus } from './data'

/** Node axes. `entity` is both the style axis and the allow-list filter. */
export const ENTITY = 'entity'
export const CAMPUS = 'campus'
/** This host's edge axis: which kind of requirement a dependency edge is. */
export const REQUIREMENT = 'requirement'

export type Entity = 'faculty' | 'department' | 'course' | 'lab'

export const CAMPUS_LABEL: Record<Campus, string> = { north: 'North campus', south: 'South campus', online: 'Online' }

// The node styles, top of the hierarchy first. A value declares what it is
// called, how it looks and how big it is; the rest is the library's — the
// charge and rest band follow from the radius and the position in this list.
// Only faculties and departments summarise what they contain; the others show
// their dependency degree, which is the default.
export const VALUES: readonly NodeStyle[] = [
  {
    id: 'faculty',
    label: 'Faculty',
    icon: '⌂',
    abbreviation: 'Fa',
    color: { light: { fill: '#334155', border: '#0F172A' }, dark: { fill: '#94A3B8', border: '#475569' } },
    size: { r: 22, iconSize: 18 },
    summaryKind: 'children',
  },
  {
    id: 'department',
    label: 'Department',
    icon: '▦',
    abbreviation: 'Dp',
    color: { light: { fill: '#0F766E', border: '#134E4A' }, dark: { fill: '#2DD4BF', border: '#0F766E' } },
    size: { r: 16, iconSize: 14 },
    summaryKind: 'children',
  },
  {
    id: 'course',
    label: 'Course',
    icon: '✎',
    abbreviation: 'Co',
    color: { light: { fill: '#B45309', border: '#78350F' }, dark: { fill: '#F59E0B', border: '#B45309' } },
    size: { r: 10, iconSize: 11 },
  },
  {
    id: 'lab',
    label: 'Lab',
    icon: '⚗',
    abbreviation: 'Lb',
    color: { light: { fill: '#BE185D', border: '#831843' }, dark: { fill: '#F472B6', border: '#BE185D' } },
    size: { r: 7, iconSize: 9 },
  },
]

const styleOf = (id: Entity): NodeStyle => VALUES.find(v => v.id === id)!

// ── Edges ───────────────────────────────────────────────────────────────────

const CONTAINS: EdgeStroke = {
  color: { light: '#94A3B8', dark: '#64748B' },
  alpha: 0.35,
  dash: [3, 4],
  width: 1,
}
// A containment type is classified by its pair alone — a child's tier and its
// container's — so the library derives which one a containment edge is.
const contains = (id: string, label: string, child: Entity, parent: Entity, strength: number, distance: number): EdgeType => ({
  id,
  label,
  sourceType: child,
  targetType: parent,
  relation: 'containment',
  physics: { strength, distance },
  style: CONTAINS,
  tooltip: `${styleOf(child).label} in ${styleOf(parent).label}`,
})

export const EDGE_TYPES: readonly EdgeType[] = [
  contains('deptInFaculty', 'Dp→Fa', 'department', 'faculty', 0.35, 520),
  contains('courseInDept', 'Co→Dp', 'course', 'department', 0.5, 200),
  contains('labInCourse', 'Lb→Co', 'lab', 'course', 0.9, 60),
  {
    id: 'prerequisite',
    label: 'Pre',
    sourceType: 'course',
    targetType: 'course',
    relation: 'dependency',
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
    relation: 'dependency',
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
    relation: 'dependency',
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

/**
 * The tie-breaker the declared pairs cannot settle: three dependency types run
 * between a course and a course, and only the edge's own `requirement` tells
 * them apart. It answers for every dependency, whatever its endpoints (a lab
 * can require a course or another lab), and says nothing for a containment
 * edge, so the declared pairs above decide that.
 */
function classifyEdge(edge: GraphEdge): string | undefined {
  if (isContainment(edge)) return undefined
  const kind = edge.dimensions?.[REQUIREMENT]
  return kind === 'corequisite' || kind === 'recommended' ? kind : 'prerequisite'
}

// ── Filter axes ─────────────────────────────────────────────────────────────

const ENTITY_CHIPS: readonly FilterChip[] = [
  {
    id: 'organisation',
    label: 'Organisation',
    icon: styleOf('faculty').icon,
    tint: 'faculty',
    values: ['faculty', 'department'],
  },
  {
    id: 'course',
    label: 'Courses',
    icon: styleOf('course').icon,
    tint: 'course',
    values: ['course'],
  },
  {
    id: 'lab',
    label: 'Labs',
    icon: styleOf('lab').icon,
    tint: 'lab',
    values: ['lab'],
  },
]

const FILTERS: readonly DimensionDescriptor[] = [
  {
    id: ENTITY,
    label: 'Show',
    // An allow-list: nothing selected shows nothing. Its names come from the
    // style axis, which this is; its chips group three values into two.
    emptyMeans: 'none',
    chipsFor: values => ENTITY_CHIPS.filter(c => c.values.some(v => values.includes(v))),
    // Opens on departments and courses, not on every entity.
    initialSelection: () => ['department', 'course'],
  },
  {
    id: CAMPUS,
    label: 'Campus',
    // Nothing selected shows every campus; faculties and departments have none
    // and always show. A narrowing axis, so the policies and the one chip per
    // campus are the defaults.
    emptyMeans: 'all',
    labelFor: v => CAMPUS_LABEL[v as Campus] ?? v,
  },
]

// ── Scalars, hover line, highlight ──────────────────────────────────────────


// A scalar answers raw numbers — the payload's value above its floor — and the
// frame divides by the largest, so the heaviest course sits at 1.
function scalarOf(id: string, label: string, tooltip: string, key: string, floor: number): ScalarAxis {
  return {
    id,
    label,
    tooltip,
    compute(graph: ReadableGraph) {
      const raw = new Map<string, number>()
      for (const n of graph.nodes) {
        const v = payloadNumber(n, key)
        if (v !== undefined) raw.set(n.id, v - floor)
      }
      return raw
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
    if (!isContainment(e) && members.has(e.sourceId)) nodes.add(e.targetId)
  }
  return { nodes }
}

export const spec: OntologySpec = {
  styleDimension: ENTITY,
  styleLabel: 'Entity',
  values: VALUES,
  filterDimensions: FILTERS,
  edgeTypes: EDGE_TYPES,
  classifyEdge,
  scalars: SCALARS,
  contextLine,
  highlight,
}

export const ontology = createOntology(spec)
