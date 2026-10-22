// What the controls offer: only what the post-filter visible set holds (R35,
// D59) — a push token per bucket some visible node falls in, a column per such
// bucket on each layout axis, and a pull token per spring category some edge
// the simulation SPRINGS falls in. That last set is the simulation's own
// predicate (`sprungEdges`), not the graduated edges the canvas draws: a
// graduated edge is re-pointed for drawing and never sprung, so a token
// classified over it would tune nothing (REVIEW_7 C9). One function, read by
// the view and by the harness, so the harness pins what the view offers
// rather than re-deriving it.

import type { GraphEdge } from '../../graph/model'
import type { PhysicsSubject, ResolvedPhysics } from '../../graph/forces'
import { isScalarAxis, presentBuckets, presentSpringCategories } from '../../graph/forces'

export interface PresentSets {
  readonly push: ReadonlySet<string>
  readonly bandX: ReadonlySet<string>
  readonly bandY: ReadonlySet<string>
  readonly springs: ReadonlySet<string>
}

/** The sets, from the visible nodes and the edges the simulation springs (`sprungEdges`). */
export function presentSetsOf(
  visibleNodes: readonly (PhysicsSubject & { id: string })[],
  sprung: readonly GraphEdge[],
  resolved: ResolvedPhysics,
  getNode: (id: string) => PhysicsSubject | undefined,
): PresentSets {
  return {
    push: new Set(presentBuckets(visibleNodes, resolved.push)),
    bandX: isScalarAxis(resolved.bandX) ? new Set<string>() : new Set(presentBuckets(visibleNodes, resolved.bandX)),
    bandY: isScalarAxis(resolved.bandY) ? new Set<string>() : new Set(presentBuckets(visibleNodes, resolved.bandY)),
    springs: presentSpringCategories(resolved.spring, sprung, getNode),
  }
}
