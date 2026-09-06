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

import type { DimensionId, DimensionMap, DimensionValue } from './dimension'
import type { GraphEdge } from './model'
import type { NodeTypeDefinition } from './node-types'
import type { EdgeTypeDefinition } from './edge-types'

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
  readonly styleDimension: DimensionId
  /** Every node-type key, in declaration order (top of the hierarchy first). */
  readonly nodeTypeKeys: readonly DimensionValue[]
  /** Every edge category, in control-panel order. */
  readonly edgeTypes: readonly EdgeTypeDefinition[]

  /**
   * Style, size, physics and summary metadata for a value. Never throws — a
   * value the taxonomy does not declare, and an ABSENT value, both resolve to
   * the declared fallback.
   */
  styleForKey(key: DimensionValue | undefined): NodeTypeDefinition
  /** Where a node sits on the style axis, or undefined if it sits nowhere. */
  valueFor(subject: StyleSubject): DimensionValue | undefined
  /** The same, addressed by a node. The hot-path entry point. */
  resolveNodeStyle(subject: StyleSubject): NodeTypeDefinition
  /**
   * The spring category an edge belongs to, resolved from the edge and its two
   * endpoints. The endpoints are passed rather than cached on the edge: a
   * denormalized copy is a second source of truth for a node's identity, and it
   * goes stale the moment an edge is re-pointed during graduation.
   */
  resolveEdgeType(edge: GraphEdge, src: StyleSubject, tgt: StyleSubject): EdgeTypeDefinition
}

/** What a host declares in order to build one. */
export interface OntologySpec {
  styleDimension: DimensionId
  nodeTypeKeys: readonly DimensionValue[]
  nodeStyles: Readonly<Record<DimensionValue, NodeTypeDefinition>>
  edgeTypes: readonly EdgeTypeDefinition[]
  resolveEdgeType(edge: GraphEdge, src: StyleSubject, tgt: StyleSubject): EdgeTypeDefinition
  /**
   * Returned for a key the host did not declare. Required, not optional: a
   * taxonomy that cannot say what an unknown value looks like has no answer for
   * the one case that matters.
   */
  fallbackStyle: NodeTypeDefinition
}

export function createOntology(spec: OntologySpec): Ontology {
  const { nodeStyles, fallbackStyle } = spec
  // Warn once per unrecognized key, and once PER ONTOLOGY: this resolves per
  // node per frame, so a warning on every miss buries the first under sixty a
  // second — but a process-global set would also silence a second taxonomy that
  // is missing the same key, which is a different bug being hidden by the
  // de-duplication meant for the first.
  const warned = new Set<string>()
  const styleForKey = (key: DimensionValue | undefined): NodeTypeDefinition => {
    const style = key === undefined ? undefined : nodeStyles[key]
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
    styleDimension,
    nodeTypeKeys: spec.nodeTypeKeys,
    edgeTypes: spec.edgeTypes,
    styleForKey,
    valueFor,
    // Hot path: one property read, one record lookup, one branch. No allocation
    // — this runs per node per frame in the draw loop.
    resolveNodeStyle: subject => styleForKey(valueFor(subject)),
    resolveEdgeType: spec.resolveEdgeType,
  }
}
