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

import type { GraphEdge, NodeType } from './model'
import type { NodeTypeDefinition } from './node-types'
import type { EdgeTypeDefinition } from './edge-types'

/** The minimum a consumer needs of a node in order to resolve its style. */
export type StyleSubject = { nodeType: NodeType }

export interface Ontology {
  /** Every node-type key, in declaration order (top of the hierarchy first). */
  readonly nodeTypeKeys: readonly NodeType[]
  /** Every edge category, in control-panel order. */
  readonly edgeTypes: readonly EdgeTypeDefinition[]

  /** Style, size, physics and summary metadata for a key. Never throws. */
  styleForKey(key: NodeType): NodeTypeDefinition
  /** The same, addressed by a node. The hot-path entry point. */
  resolveNodeStyle(subject: StyleSubject): NodeTypeDefinition
  /** The spring category an edge belongs to. */
  resolveEdgeType(edge: GraphEdge): EdgeTypeDefinition
}

/** What a host declares in order to build one. */
export interface OntologySpec {
  nodeTypeKeys: readonly NodeType[]
  nodeStyles: Readonly<Record<NodeType, NodeTypeDefinition>>
  edgeTypes: readonly EdgeTypeDefinition[]
  resolveEdgeType(edge: GraphEdge): EdgeTypeDefinition
  /**
   * Returned for a key the host did not declare. Required, not optional: a
   * taxonomy that cannot say what an unknown value looks like has no answer for
   * the one case that matters.
   */
  fallbackStyle: NodeTypeDefinition
}

// Warn once per unrecognized key. Once, because this resolves per node per
// frame — a warning on every miss would bury the first one under sixty a second
// and make the console useless exactly when it is needed.
const warned = new Set<string>()
function warnOnce(key: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(
    `[graph] no style declared for node key ${JSON.stringify(key)}; using the fallback. ` +
    'The graph will render, but this node is drawn with placeholder styling.',
  )
}

export function createOntology(spec: OntologySpec): Ontology {
  const { nodeStyles, fallbackStyle } = spec
  const styleForKey = (key: NodeType): NodeTypeDefinition => {
    const style = nodeStyles[key]
    if (style !== undefined) return style
    warnOnce(key)
    return fallbackStyle
  }
  return {
    nodeTypeKeys: spec.nodeTypeKeys,
    edgeTypes: spec.edgeTypes,
    styleForKey,
    resolveNodeStyle: subject => styleForKey(subject.nodeType),
    resolveEdgeType: spec.resolveEdgeType,
  }
}
