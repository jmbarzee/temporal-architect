// The taxonomy, as an injected container rather than an imported singleton.
//
// Twelve modules reach into the node and edge registries directly today, which
// means the graph engine cannot be pointed at a different taxonomy without
// editing the engine. This is the seam that fixes that: the library owns the
// *shape* of a taxonomy, a host supplies the *entries*, and every consumer
// resolves through the container it is handed.
//
// Two properties matter more than the shape itself:
//
//   - **Resolution never throws.** A lookup miss returns a declared fallback.
//     Today a miss is impossible because the key space is closed, but the point
//     of this seam is to open it — and an unguarded miss is a `TypeError` inside
//     a requestAnimationFrame callback, which React error boundaries do not
//     cover: the canvas freezes on its last good frame with no error UI and no
//     console boundary. It looks like a hang, not a lookup failure.
//   - **Resolution allocates nothing.** It sits in the per-frame draw loop and
//     the O(n²) charge loop, so it is a record lookup and a branch, never a
//     constructed object.

import type { DimensionDescriptor, DimensionId, DimensionMap, DimensionValue } from './dimension'
import { hasOwn } from './dimension'
import type { GraphEdge } from './model'
import type { NodeTypeDefinition } from './taxonomy'
import type { EdgeTypeDefinition, EdgeTypeId } from './taxonomy'
import type { ScalarAxis } from './scalar'
import { BUILT_IN_SCALARS } from './scalar'

/** The minimum a consumer needs of a node in order to resolve its style. */
export type StyleSubject = { dimensions: DimensionMap }

export interface Ontology {
  /**
   * The axis style resolution keys on.
   *
   * One axis, named once. Every other feature elects its own — the physics reads
   * its axis off the force params, filters read theirs off the filter — and no
   * feature composes two.
   */
  /**
   * The axis this taxonomy resolves style on.
   *
   * A method, not a field, and that is a correctness property rather than a
   * style choice. It was a field *and* a value closed over by `valueFor` and
   * `resolveNodeStyle` — the same axis stored twice — so a container derived by
   * spreading (`{ ...ontology, styleDimension: 'sourceFile' }`) rewrote only the
   * field and left the closures answering on the old axis. The result was an
   * object that disagreed with itself, and consumers split on which half they
   * read: `defaultParamsFor` took the field, the draw loop took the closure. A
   * host deriving one to recolour by file would have got the original colours
   * AND a physics layer keyed on an axis with no matching entries, every lookup
   * falling through to the absent-value defaults — a collapsed layout, no error.
   *
   * With one source there is nothing to override out of step.
   */
  styleAxis(): DimensionId
  /** The style axis's display name, for a control that names axes. */
  styleLabel(): string
  /**
   * The axes the filter chain may operate on, with their per-axis policies.
   *
   * Host-declared, like the entries: which axes exist is a domain fact. The
   * engine reads only the policies (T7/T8/T9) and never enumerates the ids.
   */
  readonly filterDimensions: readonly DimensionDescriptor[]
  /** One axis's policies, or undefined if the host does not declare it. */
  descriptorFor(dimension: DimensionId): DimensionDescriptor | undefined
  /**
   * The value a subject presents on one axis — read off its dimension map, for
   * every axis alike. An axis that is a projection of another (this domain's
   * kind axis is a function of its type axis) is materialized by the host when
   * it builds the node, so nothing here knows which axes are derived.
   */
  valueOn(subject: StyleSubject, dimension: DimensionId): DimensionValue | undefined
  /** Every node-type key, in declaration order (top of the hierarchy first). */
  readonly nodeTypeKeys: readonly DimensionValue[]
  /** Every edge category, in control-panel order. */
  readonly edgeTypes: readonly EdgeTypeDefinition[]
  /** Every computed scalar a layout axis may key on: the built-ins, then the host's. */
  readonly scalars: readonly ScalarAxis[]

  /**
   * Style, size, physics and summary metadata for a value. Never throws — a
   * value the taxonomy does not declare, and an ABSENT value, both resolve to
   * the declared fallback.
   */
  styleForKey(key: DimensionValue | undefined): NodeTypeDefinition
  /** Where a node sits on the style axis, or undefined if it sits nowhere. */
  valueFor(subject: StyleSubject): DimensionValue | undefined
  /**
   * Short label for a value — one or two characters. Control surfaces render a
   * token per value and have no room for a full name.
   */
  abbreviationFor(value: DimensionValue): string
  /**
   * How the style axis's values group for layout, in display order.
   *
   * A control surface that lays values out spatially needs to know which belong
   * together; without this it can only render one flat row, which is a worse
   * control surface than the one being generalized. Groups are presentational —
   * nothing in the physics reads them.
   */
  readonly styleGroups: readonly StyleGroup[]
  /** The same, addressed by a node. The hot-path entry point. */
  resolveNodeStyle(subject: StyleSubject): NodeTypeDefinition
  /**
   * The host's rule for which category an edge on the style axis belongs to,
   * given its two endpoint values. The engine reads the axis and hands the
   * values over, so the rule never decides which dimension to look at — and it
   * applies only while springs key on the style axis unmapped; any other
   * (axis, mapping) resolves through the library's pair rule (D2). The values
   * are read live from the endpoint nodes, never cached on the edge: a
   * denormalized copy goes stale the moment graduation re-points an edge.
   */
  resolveEdgeType(edge: GraphEdge, src: DimensionValue | undefined, tgt: DimensionValue | undefined): EdgeTypeId
}

/** What a host declares in order to build one. */
/** A named run of values that lay out together on a control surface. */
export interface StyleGroup {
  id: string
  values: readonly DimensionValue[]
}

export interface OntologySpec {
  styleDimension: DimensionId
  styleLabel: string
  abbreviations: Readonly<Record<DimensionValue, string>>
  styleGroups: readonly StyleGroup[]
  nodeTypeKeys: readonly DimensionValue[]
  filterDimensions: readonly DimensionDescriptor[]
  nodeStyles: Readonly<Record<DimensionValue, NodeTypeDefinition>>
  edgeTypes: readonly EdgeTypeDefinition[]
  resolveEdgeType(edge: GraphEdge, src: DimensionValue | undefined, tgt: DimensionValue | undefined): EdgeTypeId
  /**
   * Computed scalars this host adds to the built-ins (R8): each reads node
   * metadata — its own payload included — and the graph's structure, and
   * answers per node in [0, 1]. Empty is a fine answer.
   */
  scalars: readonly ScalarAxis[]
  /**
   * Returned for a key the host did not declare. Required, not optional: a
   * taxonomy that cannot say what an unknown value looks like has no answer for
   * the one case that matters.
   */
  fallbackStyle: NodeTypeDefinition
}

/**
 * Build the container, refusing an incoherent spec.
 *
 * The style value set is declared in four places — `nodeTypeKeys`, the keys
 * of `nodeStyles`, the values in `styleGroups`, the keys of `abbreviations` —
 * and nothing but this check holds them together. A value in one list and not
 * another used to resolve, silently, to the fallback style or to no bucket at
 * all. To derive a variant, build one from a spec (`createOntology({ ...spec,
 * … })`); spreading the built object copies closures that still read the
 * original's fields.
 */
export function createOntology(spec: OntologySpec): Ontology {
  const { nodeStyles, fallbackStyle } = spec
  const keys = new Set(spec.nodeTypeKeys)
  const problems: string[] = []
  for (const k of spec.nodeTypeKeys) if (!hasOwn(nodeStyles, k)) problems.push(`nodeTypeKeys lists ${JSON.stringify(k)} but nodeStyles declares no style for it`)
  for (const k of Object.keys(nodeStyles)) if (!keys.has(k)) problems.push(`nodeStyles declares ${JSON.stringify(k)}, which nodeTypeKeys does not list`)
  for (const g of spec.styleGroups) for (const v of g.values) if (!keys.has(v)) problems.push(`styleGroups.${g.id} names ${JSON.stringify(v)}, which nodeTypeKeys does not list`)
  for (const k of Object.keys(spec.abbreviations)) if (!keys.has(k)) problems.push(`abbreviations names ${JSON.stringify(k)}, which nodeTypeKeys does not list`)
  const scalarIds = new Set<string>()
  for (const sc of [...BUILT_IN_SCALARS, ...spec.scalars]) {
    if (scalarIds.has(sc.id)) problems.push(`scalar ${JSON.stringify(sc.id)} is declared twice (the built-ins are reach, degree and depth)`)
    scalarIds.add(sc.id)
  }
  if (problems.length > 0) throw new Error(`taxonomy is incoherent: ${problems.join('; ')}`)
  const byDimension = new Map(spec.filterDimensions.map(d => [d.id, d]))
  // Warn once per unrecognized key, and once PER ONTOLOGY: this resolves per
  // node per frame, so a warning on every miss buries the first under sixty a
  // second — but a process-global set would also silence a second taxonomy that
  // is missing the same key, which is a different bug being hidden by the
  // de-duplication meant for the first.
  const warned = new Set<string>()
  const styleForKey = (key: DimensionValue | undefined): NodeTypeDefinition => {
    // `Object.hasOwn`, not a plain index: keys are host-supplied strings, and
    // `nodeStyles['constructor']` walks the prototype chain and returns the
    // `Object` function. That is not `undefined`, so the miss goes undetected
    // and this returns it as though it were a style — and the first consumer to
    // read `.size.r` off it throws, inside the draw loop, which is the exact
    // failure the required-fallback design exists to prevent.
    const style = key !== undefined && hasOwn(nodeStyles, key) ? nodeStyles[key] : undefined
    if (style !== undefined) return style
    const label = key ?? '<absent>'
    if (!warned.has(label)) {
      warned.add(label)
      console.warn(
        `[graph] no style declared for node key ${JSON.stringify(label)}; using the fallback. ` +
        'The graph will render, but this node is drawn with placeholder styling.',
      )
    }
    return fallbackStyle
  }
  const { styleDimension } = spec
  const valueFor = (subject: StyleSubject): DimensionValue | undefined =>
    subject.dimensions[styleDimension]
  return {
    styleAxis: () => styleDimension,
    styleLabel: () => spec.styleLabel,
    filterDimensions: spec.filterDimensions,
    descriptorFor: id => byDimension.get(id),
    valueOn: (subject, dimension) => subject.dimensions[dimension],
    // `hasOwn`, for the same reason as `styleForKey` (D39): a value named
    // `constructor` or `toString` resolves up the prototype chain, the `??`
    // never fires, and this returns a Function where a string is expected.
    // D39 fixed the two lookups it found and missed this one.
    abbreviationFor: value =>
      hasOwn(spec.abbreviations, value) ? spec.abbreviations[value] : value,
    styleGroups: spec.styleGroups,
    nodeTypeKeys: spec.nodeTypeKeys,
    edgeTypes: spec.edgeTypes,
    scalars: [...BUILT_IN_SCALARS, ...spec.scalars],
    styleForKey,
    valueFor,
    // Hot path: one property read, one record lookup, one branch. No allocation
    // — this runs per node per frame in the draw loop.
    resolveNodeStyle: subject => styleForKey(valueFor(subject)),
    resolveEdgeType: spec.resolveEdgeType,
  }
}
