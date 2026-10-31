// The layout as state: the force tuning and the node scale, as the user set
// them. The view keeps it or the host controls it, like the filter; and it
// goes to a store and back as plain data, like the filter, so a host restores
// what the user tuned and not only where the nodes came to rest.
//
// The state is opaque to a host, and this module's declaration reaches none
// of the engine's types: `ForceParams` and the force kernels are not part of
// any surface (DESIGN.md, "The forces"). The opening is `layout-internal.ts`,
// called by value from here and the view.

import type { AxisId } from './axis'
import { isPlainRecord } from '../json'
import { defaultLayoutFor, forcesFromJSON, forcesToJSON, makeLayout, nodeScaleFromJSON, openLayout } from './layout-internal'
import type { ScalarSpan } from './scalar'
import type { SpringPhysics } from './shapes'
import type { Taxonomy } from './taxonomy'

declare const LAYOUT_STATE: unique symbol

/**
 * The layout as the user tuned it: the forces (which axis push and pull key
 * on and the per-bucket overrides; the two layout axes with theirs; the
 * multipliers, exponents, gravities and dynamics) and the node scale. Opaque
 * to a host: keep it, hand it back as `layout` or `defaultLayout`, and carry
 * it to a store through `layoutToJSON` and `layoutFromJSON`. The view retunes
 * it for the graph and taxonomy it faces — a tuning on an axis the graph no
 * longer carries returns to the style axis — and reports the result.
 */
export interface LayoutState {
  readonly [LAYOUT_STATE]: true
}

/** One layout axis as plain data: a node axis with the bands the user changed, or a computed scalar with the span they dragged. */
export type LayoutTuningJSON =
  | { axis: AxisId; overrides?: Record<string, { min: number; max: number }> }
  | { scalar: string; span?: ScalarSpan }

/**
 * A layout as plain data, for a store, a URL or a host's own hand: what
 * `layoutToJSON` writes and `layoutFromJSON` reads. Every part is optional
 * and defaults to the taxonomy's, so a host that wants the view to open on a
 * scalar writes `{ forces: { bandY: { scalar: 'credits' } } }` and nothing
 * else.
 */
export interface LayoutJSON {
  forces?: {
    /** The axis push and pull key on, with the buckets the user changed: each bucket's charge and core radius, each edge type's spring. */
    pair?: { axis: AxisId; push?: Record<string, { charge: number; coreRadius: number }>; spring?: Record<string, SpringPhysics> }
    /** The horizontal layout axis. */
    bandX?: LayoutTuningJSON
    /** The vertical layout axis. */
    bandY?: LayoutTuningJSON
    /** Scales every charge (repulsion). */
    pushMultiplier?: number
    /** Scales every core radius (the softening of a charge at close range). */
    coreRadiusMultiplier?: number
    /** The power of (distance² + softening) a charge falls off by; 1 is inverse-square. */
    chargeExponent?: number
    /** Scales every spring (attraction). */
    pullMultiplier?: number
    /** Scales every rest length. */
    distanceMultiplier?: number
    /** The power of a spring's displacement; 1 is Hooke's law. */
    linkExponent?: number
    /** The horizontal band gravity; 0 switches it off. */
    gravityX?: number
    /** The vertical band gravity; 0 switches it off. */
    gravityY?: number
    /** The power of the displacement outside a rest band; 1 is linear. */
    gravityBandExp?: number
    /** Radial layout: the vertical axis's bands become rings about the origin. */
    radial?: boolean
    /** The inward pull on a node by its downstream reach; 0 is off. */
    gravityTopological?: number
    /** The power of the reach score; higher makes the biggest hubs pull hardest. */
    gravityTopologicalExp?: number
    /** The pull toward the origin — the baseline when no band axis acts. */
    gravityCenter?: number
    /** Whether the topological pull acts. */
    topologicalEnabled?: boolean
    /** How fast the simulation cools per tick. */
    alphaDecay?: number
    /** The temperature the simulation stops at. */
    alphaMin?: number
    /** How much of a node's velocity survives a tick. */
    velocityDecay?: number
  }
  /** The node scale: the size knob, and how small and how large zoom may draw a node. */
  nodeScale?: { baseMul?: number; minZoomMul?: number; maxZoomMul?: number }
}

/** A layout as plain data — every tuning by its axis or scalar, every override by its bucket, every number — for a store or a URL. */
export function layoutToJSON(layout: LayoutState): LayoutJSON {
  const { forces, nodeScale } = openLayout(layout)
  return { forces: forcesToJSON(forces), nodeScale: { ...nodeScale } }
}

/**
 * The layout `layoutToJSON` wrote — or a host's own partial one — over the
 * taxonomy's defaults, or undefined when a part present is not its shape:
 * stored data is not trusted to be, and a host falls back to the default
 * rather than to a layout that means something else. A tuning on an axis
 * other than the style axis is built without buckets and completed by the
 * view when the graph arrives, its overrides kept where their values survive.
 */
export function layoutFromJSON(value: unknown, taxonomy: Taxonomy): LayoutState | undefined {
  if (!isPlainRecord(value)) return undefined
  const base = defaultLayoutFor(taxonomy)
  const forces = value.forces === undefined ? base.forces : forcesFromJSON(value.forces, base.forces, taxonomy)
  if (!forces) return undefined
  const nodeScale = value.nodeScale === undefined ? base.nodeScale : nodeScaleFromJSON(value.nodeScale, base.nodeScale)
  if (!nodeScale) return undefined
  return makeLayout(forces, nodeScale)
}
