// The taxonomy, as an injected container rather than an imported singleton.
//
// The library owns the *shape* of a taxonomy, a host supplies the *entries*,
// and every consumer resolves through the container it is handed, so the
// graph engine can be pointed at a different taxonomy without editing the
// engine.
//
// Two properties matter more than the shape itself:
//
//   - **Resolution never throws.** A lookup miss returns a declared fallback.
//     An unguarded miss is a `TypeError` inside a requestAnimationFrame
//     callback, which React error boundaries do not cover: the canvas freezes
//     on its last good frame with no error UI and no console boundary. It
//     looks like a hang, not a lookup failure.
//   - **Resolution allocates nothing.** It sits in the per-frame draw loop and
//     the O(n²) charge loop, so it is a record lookup and a branch, never a
//     constructed object. Every default is filled in here, once, at
//     construction.

import type { DimensionDescriptor, DimensionId, DimensionMap, DimensionValue, ResolvedDimensionDescriptor } from './dimension'
import { hasOwn, resolveDescriptor } from './dimension'
import type { GraphEdge, GraphNode } from './model'
import type { EdgeType, EdgeTypeId, NodeStyle, ResolvedEdgeType, ResolvedNodeStyle } from './taxonomy'
import { resolveEdgeType as resolveEdgeTypeDefaults, resolveNodeStyle as resolveNodeStyleDefaults, typicalSpringOf } from './taxonomy'
import type { ScalarAxis } from './scalar'
import type { EdgeStroke } from './scheme'
import { cssSuffix, isSchemeColor } from './scheme'
import { BUILT_IN_SCALARS } from './scalar'

/** A highlight: the node ids lit and the edge ids lit. Edges absent means "every visible edge between lit nodes". */
export interface Highlight {
  readonly nodes: ReadonlySet<string>
  readonly edges?: ReadonlySet<string>
}

/** What a highlight rule may read: the visible graph, and a lookup for any node. */
export interface HighlightGraph {
  readonly visibleNodes: readonly GraphNode[]
  readonly visibleEdges: readonly GraphEdge[]
  readonly visibleIds: ReadonlySet<string>
  getNode(id: string): GraphNode | undefined
}

/** Which way a highlight walks from its node: what it depends on, or what depends on it. */
export type HighlightDirection = 'downstream' | 'upstream'

/** The minimum a consumer needs of a node in order to resolve its style. */
export type StyleSubject = { dimensions: DimensionMap }

export interface Ontology {
  /**
   * The axis this taxonomy resolves style on.
   *
   * One axis, named once. Every other feature elects its own — the physics reads
   * its axis off the force params, filters read theirs off the filter — and no
   * feature composes two.
   *
   * A method, not a field, and that is a correctness property rather than a
   * style choice: a container derived by spreading (`{ ...ontology,
   * styleDimension: 'other' }`) would rewrite a field and leave the closures
   * answering on the old axis — an object that disagrees with itself, the
   * draw loop reading one half and the physics the other. With one source
   * there is nothing to override out of step.
   */
  styleAxis(): DimensionId
  /** The style axis's display name, for a control that names axes. */
  styleLabel(): string
  /**
   * The axes the filter chain may operate on, with their per-axis policies,
   * every default filled in. Host-declared, like the entries: which axes
   * exist is a domain fact. The engine reads only the policies and never
   * enumerates the ids.
   */
  readonly filterDimensions: readonly ResolvedDimensionDescriptor[]
  /** One axis's policies, or undefined if the host does not declare it. */
  descriptorFor(dimension: DimensionId): ResolvedDimensionDescriptor | undefined
  /**
   * The value a subject presents on one axis — read off its dimension map, for
   * every axis alike. An axis that is a projection of another is materialized
   * by the host when it builds the node, so nothing here knows which axes are
   * derived.
   */
  valueOn(subject: StyleSubject, dimension: DimensionId): DimensionValue | undefined
  /** Every style value, in declaration order (top of the hierarchy first). */
  readonly styleValues: readonly DimensionValue[]
  /** Every edge type, in control-panel order, its defaults filled in. */
  readonly edgeTypes: readonly ResolvedEdgeType[]
  /** Every computed scalar a layout axis may key on: the built-ins, then the host's. */
  readonly scalars: readonly ScalarAxis[]
  /** How the canvas strokes an edge of this type. Loud for an id the host did not declare. */
  edgeStrokeFor(id: EdgeTypeId): EdgeStroke
  /** The hover box's context line(s) for a node — the host's, or its parent's name. */
  contextLine(node: GraphNode, parent: GraphNode | undefined): string | readonly string[] | undefined
  /** What the search control matches against for a node — the host's text, or the name. */
  searchText(node: GraphNode): string
  /** The highlight for an active node — the host's refinement of the library's transitive walk in the given direction. */
  highlight(active: GraphNode, base: Highlight, graph: HighlightGraph, direction: HighlightDirection): Highlight

  /**
   * Style, size, physics and summary metadata for a value. Never throws — a
   * value the taxonomy does not declare, and an ABSENT value, both resolve to
   * the fallback.
   */
  styleOf(value: DimensionValue | undefined): ResolvedNodeStyle
  /** Where a node sits on the style axis, or undefined if it sits nowhere. */
  valueFor(subject: StyleSubject): DimensionValue | undefined
  /**
   * Short label for a value — one or two characters. Control surfaces render a
   * token per value and have no room for a full name. A value the taxonomy
   * does not declare abbreviates to its own first two characters.
   */
  abbreviationFor(value: DimensionValue): string
  /** The same as `styleOf`, addressed by a node. The hot-path entry point. */
  resolveNodeStyle(subject: StyleSubject): ResolvedNodeStyle
  /**
   * The host's rule for which type an edge on the style axis belongs to,
   * given its two endpoint values. The engine reads the axis and hands the
   * values over, so the rule never decides which dimension to look at — and it
   * applies only while springs key on the style axis unmapped; any other
   * (axis, mapping) resolves through the library's pair rule. The values
   * are read live from the endpoint nodes, never cached on the edge: a
   * denormalized copy goes stale the moment graduation re-points an edge.
   */
  resolveEdgeType(edge: GraphEdge, src: DimensionValue | undefined, tgt: DimensionValue | undefined): EdgeTypeId
  /** Which of two graduated edges on one visible pair survives: the host's choice, or the one kept so far. */
  collapse(kept: GraphEdge, candidate: GraphEdge): GraphEdge
}

/**
 * What a host declares in order to build an `Ontology`: the style axis and
 * its values, the edge types and the rule that classifies an edge, the filter
 * axes. Everything with a sensible default is optional.
 */
export interface OntologySpec {
  /** The axis every node's style is read on. */
  styleDimension: DimensionId
  /** The style axis's display name. Absent, the axis id. */
  styleLabel?: string
  /**
   * The style values, top of the hierarchy first. The order places each
   * value's rest band down the stack when it declares none, and orders the
   * control surfaces and the hover box's child counts.
   */
  values: readonly NodeStyle[]
  /**
   * Drawn for a value the taxonomy does not declare, and for a node with no
   * value on the style axis. Absent, a grey disc with a question mark that
   * rests anywhere in the stack.
   */
  fallbackStyle?: Omit<NodeStyle, 'id'>
  edgeTypes: readonly EdgeType[]
  /** The rule: which declared edge type an edge is, given its endpoints' style values. */
  resolveEdgeType(edge: GraphEdge, src: DimensionValue | undefined, tgt: DimensionValue | undefined): EdgeTypeId
  filterDimensions: readonly DimensionDescriptor[]
  /**
   * Computed scalars this host adds to the built-ins: each reads node
   * metadata — its own payload included — and the graph's structure, and
   * answers per node in [0, 1]. Absent, the built-ins alone.
   */
  scalars?: readonly ScalarAxis[]
  /**
   * The hover box's context under the name: what a host wants said there —
   * addressing metadata from its own payload, a parent by another name, an
   * origin — as one line or several. Absent, the line is the parent's name.
   */
  contextLine?: (node: GraphNode, parent: GraphNode | undefined) => string | readonly string[] | undefined
  /**
   * What the search control matches a node on, case-insensitively: a code
   * from the payload beside the name, say. Absent, the name.
   */
  searchText?: (node: GraphNode) => string
  /**
   * The highlight for an active node: given the library's transitive walk
   * from it in `direction`, the host may widen it (members it relates by
   * metadata) or replace it. Absent, the walk is the highlight.
   */
  highlight?: (active: GraphNode, base: Highlight, graph: HighlightGraph, direction: HighlightDirection) => Highlight
  /**
   * When two dependency edges each lose an end to a hidden node and come to
   * run between the same two visible nodes, which of the two originals the
   * drawn edge stands for. Both arguments are the host's own edges, so
   * a host whose edges carry routing metadata may prefer the one that does.
   * Absent, the one met first in the host's edge order is kept. Two edges
   * whose ends are both visible are never collapsed.
   */
  collapse?: (kept: GraphEdge, candidate: GraphEdge) => GraphEdge
}

/** The style for a value the taxonomy does not declare, when the host declares none. */
const DEFAULT_FALLBACK: Omit<NodeStyle, 'id'> = {
  label: 'Unknown',
  icon: '?',
  color: { light: { fill: '#CBD5E1', border: '#94A3B8' }, dark: { fill: '#64748B', border: '#94A3B8' } },
  size: { r: 10 },
  summaryKind: 'none',
}

/**
 * Build the container, refusing an incoherent spec: a value declared twice, an
 * edge type declared twice or running between values nobody declared, a
 * filter axis declared twice, a colour no reader can parse, a band whose ends
 * cross, a policy outside its vocabulary, a scalar id already taken. Each
 * used to resolve, silently, to the fallback or to no bucket at all. To
 * derive a variant, build one from a spec (`createOntology({ ...spec, … })`);
 * spreading the built object copies closures that still read the original's
 * fields.
 */
export function createOntology(spec: OntologySpec): Ontology {
  const problems: string[] = []
  const values = spec.values.map(v => v.id)
  const valueSet = new Set<DimensionValue>()
  for (const v of values) {
    if (valueSet.has(v)) problems.push(`style value ${JSON.stringify(v)} is declared twice`)
    valueSet.add(v)
  }
  // The custom-property name is derived from the value id (kebab case), so two
  // ids may share one — and one may be empty. Refuse both: the canvas and a
  // token would read the same value differently.
  const bySuffix = new Map<string, DimensionValue>()
  for (const v of valueSet) {
    const suffix = cssSuffix(v)
    if (suffix === '') problems.push(`style value ${JSON.stringify(v)} has no custom-property name (its id kebab-cases to nothing)`)
    const other = bySuffix.get(suffix)
    if (other !== undefined) problems.push(`style values ${JSON.stringify(other)} and ${JSON.stringify(v)} share the custom-property name --gv-node-${suffix}`)
    bySuffix.set(suffix, v)
  }
  // Every colour must be a form every reader parses without a browser (hex or
  // rgb()); the canvas would otherwise ignore it silently.
  const colour = (where: string, c: string) => { if (!isSchemeColor(c)) problems.push(`${where} is ${JSON.stringify(c)}, not a hex or rgb() colour`) }
  const band = (where: string, b: { min: number; max: number } | undefined) => {
    if (b && !(b.min <= b.max)) problems.push(`${where} runs from ${b.min} to ${b.max}; a band's min must not exceed its max`)
  }
  const checkStyle = (where: string, style: Omit<NodeStyle, 'id'>) => {
    for (const theme of ['light', 'dark'] as const) {
      colour(`${where}.color.${theme}.fill`, style.color[theme].fill)
      colour(`${where}.color.${theme}.border`, style.color[theme].border)
    }
    if (style.whenHidden !== undefined && style.whenHidden !== 'ascend' && style.whenHidden !== 'splice') {
      problems.push(`${where}.whenHidden is ${JSON.stringify(style.whenHidden)}, not 'ascend' or 'splice'`)
    }
    if (style.summaryKind !== undefined && style.summaryKind !== 'children' && style.summaryKind !== 'degree' && style.summaryKind !== 'none') {
      problems.push(`${where}.summaryKind is ${JSON.stringify(style.summaryKind)}, not 'children', 'degree' or 'none'`)
    }
    band(`${where}.physics.band.x`, style.physics?.band?.x)
    band(`${where}.physics.band.y`, style.physics?.band?.y)
  }
  for (const v of spec.values) checkStyle(`values.${v.id}`, v)
  const fallbackSpec = spec.fallbackStyle ?? DEFAULT_FALLBACK
  checkStyle('fallbackStyle', fallbackSpec)
  const edgeIds = new Set<EdgeTypeId>()
  for (const e of spec.edgeTypes) {
    if (edgeIds.has(e.id)) problems.push(`edge type ${JSON.stringify(e.id)} is declared twice`)
    edgeIds.add(e.id)
    colour(`edgeTypes.${e.id}.style.color.light`, e.style.color.light)
    colour(`edgeTypes.${e.id}.style.color.dark`, e.style.color.dark)
    for (const end of ['sourceType', 'targetType'] as const) {
      if (!valueSet.has(e[end])) problems.push(`edgeTypes.${e.id}.${end} is ${JSON.stringify(e[end])}, which values does not declare`)
    }
    if (e.relation !== 'containment' && e.relation !== 'dependency') {
      problems.push(`edgeTypes.${e.id}.relation is ${JSON.stringify(e.relation)}, not 'containment' or 'dependency'`)
    }
  }
  const axisIds = new Set<DimensionId>()
  for (const d of spec.filterDimensions) {
    if (axisIds.has(d.id)) problems.push(`filter dimension ${JSON.stringify(d.id)} is declared twice`)
    axisIds.add(d.id)
    if (d.emptyMeans !== 'all' && d.emptyMeans !== 'none') {
      problems.push(`filterDimensions.${d.id}.emptyMeans is ${JSON.stringify(d.emptyMeans)}, not 'all' or 'none'`)
    }
  }
  const scalars = [...BUILT_IN_SCALARS, ...(spec.scalars ?? [])]
  const scalarIds = new Set<string>()
  for (const sc of scalars) {
    if (scalarIds.has(sc.id)) problems.push(`scalar ${JSON.stringify(sc.id)} is declared twice (the built-ins are reach, degree and depth)`)
    scalarIds.add(sc.id)
  }
  if (problems.length > 0) throw new Error(`taxonomy is incoherent: ${problems.join('; ')}`)

  // Every default filled in once. The styles are one object per value for
  // the life of the container: the draw loop compares them by reference.
  const n = spec.values.length
  const styles: Record<DimensionValue, ResolvedNodeStyle> = Object.create(null)
  spec.values.forEach((v, i) => { styles[v.id] = resolveNodeStyleDefaults(v, i, n) })
  // The fallback rests anywhere in the stack: it is nobody's tier.
  const fallback = resolveNodeStyleDefaults({ id: '', ...fallbackSpec }, 0, 1)
  if (n > 0 && fallbackSpec.physics?.band?.y === undefined) {
    fallback.physics.band.y = { min: styles[values[0]].physics.band.y.min, max: styles[values[n - 1]].physics.band.y.max }
  }
  const typical = typicalSpringOf(spec.edgeTypes)
  const edgeTypes = spec.edgeTypes.map(e => resolveEdgeTypeDefaults(e, typical))
  const strokeById = new Map(edgeTypes.map(e => [e.id, e.style] as const))
  const edgeStrokeFor = (id: EdgeTypeId): EdgeStroke => {
    const stroke = strokeById.get(id)
    if (!stroke) throw new Error(`edge type ${JSON.stringify(id)} has no stroke: the taxonomy does not declare it`)
    return stroke
  }

  // Warn once per unrecognized value, and once PER ONTOLOGY: this resolves per
  // node per frame, so a warning on every miss buries the first under sixty a
  // second — but a process-global set would also silence a second taxonomy that
  // is missing the same value, which is a different bug being hidden by the
  // de-duplication meant for the first.
  const warned = new Set<string>()
  const styleOf = (value: DimensionValue | undefined): ResolvedNodeStyle => {
    // `hasOwn`, not a plain index: values are host-supplied strings, and
    // `styles['constructor']` on a table with a prototype would walk the chain
    // and return the `Object` function. The table has no prototype, and the
    // check keeps that from mattering.
    const style = value !== undefined && hasOwn(styles, value) ? styles[value] : undefined
    if (style !== undefined) return style
    const label = value ?? '<absent>'
    if (!warned.has(label)) {
      warned.add(label)
      console.warn(
        `[graph] no style declared for value ${JSON.stringify(label)}; using the fallback. ` +
        'The graph will render, but this node is drawn with placeholder styling.',
      )
    }
    return fallback
  }
  const { styleDimension } = spec
  const valueFor = (subject: StyleSubject): DimensionValue | undefined => subject.dimensions[styleDimension]
  const abbreviationFor = (value: DimensionValue): string =>
    hasOwn(styles, value) ? styles[value].abbreviation : value.slice(0, 2)
  const namer = {
    axis: styleDimension,
    labelFor: (value: DimensionValue) => (hasOwn(styles, value) ? styles[value].label : value),
    abbreviationFor,
    iconFor: (value: DimensionValue) => (hasOwn(styles, value) ? styles[value].icon : ''),
  }
  const filterDimensions = spec.filterDimensions.map(d => resolveDescriptor(d, namer))
  const byDimension = new Map(filterDimensions.map(d => [d.id, d]))
  return {
    styleAxis: () => styleDimension,
    styleLabel: () => spec.styleLabel ?? styleDimension,
    filterDimensions,
    descriptorFor: id => byDimension.get(id),
    valueOn: (subject, dimension) => subject.dimensions[dimension],
    abbreviationFor,
    styleValues: values,
    edgeTypes,
    scalars,
    edgeStrokeFor,
    styleOf,
    valueFor,
    // Hot path: one property read, one record lookup, one branch. No allocation
    // — this runs per node per frame in the draw loop.
    resolveNodeStyle: subject => styleOf(valueFor(subject)),
    resolveEdgeType: spec.resolveEdgeType,
    collapse: spec.collapse ?? (kept => kept),
    contextLine: spec.contextLine ?? ((_node, parent) => parent?.name),
    searchText: spec.searchText ?? (node => node.name),
    highlight: spec.highlight ?? ((_active, base) => base),
  }
}
