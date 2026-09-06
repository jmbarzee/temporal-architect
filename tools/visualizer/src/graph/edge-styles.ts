// Edge stroke styling — the renderer's edge classifier, lifted out of
// GraphCanvas so it is callable (and observable) outside the draw loop.
//
// This is the *second* of two independent edge classifiers. `edgeTypeFor`
// (edge-types.ts) decides spring physics from the same endpoints, with
// different rules, and neither derives from the other — see the kickoff set's
// T11. Having both under golden is what makes unifying them safe later.
//
// Pure: no canvas, no DOM, no simulation state. Endpoints are taken as the
// minimal `{ nodeType }` shape the rules actually read, so callers may pass a
// GraphNode, a SimNode, or a bare projection.

import type { DimensionValue } from './dimension'
import type { GraphEdge } from './model'

// Edge styles indexed by semantic role. The nexus family carries the pink
// palette through every leg of a call:
//   - opContainment (operation → service): deep service pink, dashed
//   - epComposition (operation → endpoint): deep endpoint rose, dashed —
//     the operation's "second parent" (an endpoint that routes calls to
//     the (namespace, queue) where this operation is deployed)
//   - workflowDep   (workflow → workflow): workflow purple
//   - nexusCall     (workflow ↔ operation, spliced caller → backing): light pink
//   - dependencyNsToNs / dependencyWkToWk: named greys for the two coarsened cases
//   - dependencyDefault: fallback grey for all other dependency edges
//   - containment: subtle slate dotted, default for non-nexus containment edges
export const EDGE_STYLE = {
  containment:        { color: '#94A3B8', alpha: 0.35, dash: [3, 4], width: 1 },
  opContainment:      { color: '#DB2777', alpha: 0.55, dash: [3, 4], width: 1.2 }, // op → service
  epComposition:      { color: '#9F1239', alpha: 0.55, dash: [3, 4], width: 1.2 }, // op → endpoint
  dependencyNsToNs:   { color: '#475569', alpha: 0.85, dash: [], width: 1.8 },     // ns → ns
  dependencyWkToWk:   { color: '#64748B', alpha: 0.75, dash: [], width: 1.6 },     // worker → worker
  workflowDep:        { color: '#8B7EC8', alpha: 0.70, dash: [], width: 1.4 },     // workflow → workflow
  workflowToActivity: { color: '#4A8BC2', alpha: 0.70, dash: [], width: 1.4 },     // workflow → activity
  dependencyDefault:  { color: '#94A3B8', alpha: 0.50, dash: [], width: 1.3 },     // all other deps
  nexusCall:          { color: '#F472B6', alpha: 0.85, dash: [], width: 1.5 },     // workflow ↔ operation, or spliced
} as const

/** Stable name of one entry in EDGE_STYLE — the resolved style's identity. */
export type EdgeStyleKey = keyof typeof EDGE_STYLE
/** One resolved stroke style: colour, base alpha, dash pattern, line width. */
export type EdgeStyle = (typeof EDGE_STYLE)[EdgeStyleKey]

/**
 * The endpoint the style rules read: a resolved value on the taxonomy's axis,
 * not a node. Passing the value rather than the node keeps this classifier out
 * of the business of deciding which axis to read, and matches `edgeTypeFor` —
 * the two disagree about enough already without disagreeing about their inputs.
 */
type StyleEndpoint = DimensionValue | undefined

// Pick the right entry from EDGE_STYLE for a given edge.
//
// Order matters: the nexus family is checked first so it wins over any
// generic dependency style. Op → Service containment is the only
// containment edge that isn't slate; everything else slate-dotted. Workflow
// → Workflow gets the workflow purple to make the call backbone visible
// inside a tangle of greys. Spliced caller → backing edges are detected by
// surviving `nexusEndpoint` metadata, so they keep the nexus colour even
// once the operation node is filtered out.
//
// Resolution returns the *key*, and `edgeStyleFor` is the lookup on top of it,
// so there is exactly one set of rules: a caller that wants the style and a
// caller that wants its identity can never disagree.
export function edgeStyleKeyFor(
  edge: GraphEdge,
  src: StyleEndpoint,
  tgt: StyleEndpoint,
): EdgeStyleKey {
  if (edge.edgeType === 'containment') {
    if (src === 'nexusOperation' && tgt === 'nexusService') {
      return 'opContainment'
    }
    // op ↔ endpoint composition: visualized like opContainment (dashed,
    // nexus-family) but in the endpoint's deeper rose so the eye can tell
    // the two parents apart at a glance.
    if (
      (src === 'nexusOperation' && tgt === 'nexusEndpoint') ||
      (src === 'nexusEndpoint' && tgt === 'nexusOperation')
    ) {
      return 'epComposition'
    }
    return 'containment'
  }
  // Both directions of the workflow ↔ operation hop, plus spliced
  // caller → backing edges that retain the endpoint metadata.
  if (
    src === 'nexusOperation' || tgt === 'nexusOperation' ||
    edge.nexusEndpoint != null
  ) {
    return 'nexusCall'
  }
  if (src === 'workflow' && tgt === 'workflow') {
    return 'workflowDep'
  }
  if (
    (src === 'workflow' && tgt === 'activity') ||
    (src === 'activity' && tgt === 'workflow')
  ) {
    return 'workflowToActivity'
  }
  // The two coarsened dependency cases: namespace↔namespace and worker↔worker.
  // These are the only non-nexus, non-workflow/activity dependency types that
  // warrant a distinct style; everything else gets the neutral default.
  if (src === 'namespace' || tgt === 'namespace') {
    return 'dependencyNsToNs'
  }
  if (src === 'worker' || tgt === 'worker') {
    return 'dependencyWkToWk'
  }
  return 'dependencyDefault'
}

/** The resolved stroke style for an edge. */
export function edgeStyleFor(
  edge: GraphEdge,
  src: StyleEndpoint,
  tgt: StyleEndpoint,
): EdgeStyle {
  return EDGE_STYLE[edgeStyleKeyFor(edge, src, tgt)]
}
