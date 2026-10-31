// The layout state opened: what the view reads and writes, and the JSON
// readers that build the engine's tunings. Nothing here is on the surface:
// `ForceParams` and the force kernels are not part of any surface (DESIGN.md,
// "The forces"), and `layout.ts` — the public half — calls in by value only,
// so its declaration reaches none of this.

import type { AxisId } from './axis'
import { identityMapping } from './axis'
import { isFiniteNumber, isPlainRecord } from '../json'
import type { LayoutJSON, LayoutState, LayoutTuningJSON } from './layout'
import type { NodeScaleParams } from './node-scale'
import { DEFAULT_NODE_SCALE } from './node-scale'
import { isScalarTuning } from './scalar'
import type { SpringPhysics } from './shapes'
import type { BandRange, ForceParams, LayoutTuning, PairTuning, PushPhysics } from './simulation'
import { defaultParamsFor, namerFor, styleIdentityMapping } from './simulation'
import type { Taxonomy } from './taxonomy'

/** The layout opened: the forces and the node scale. */
export interface Layout extends LayoutState {
  readonly forces: ForceParams
  readonly nodeScale: NodeScaleParams
}

/** A layout from its parts — the one place the brand is asserted: every `LayoutState` a host holds was made here. */
export function makeLayout(forces: ForceParams, nodeScale: NodeScaleParams): Layout {
  return { forces, nodeScale } as Layout
}

/** The layout opened for the view. Total: every `LayoutState` is one `makeLayout` made. */
export function openLayout(layout: LayoutState): Layout {
  return layout as Layout
}

/** The layout a view starts from: the taxonomy's default forces and the default node scale. */
export function defaultLayoutFor(taxonomy: Taxonomy): Layout {
  return makeLayout(defaultParamsFor(taxonomy), DEFAULT_NODE_SCALE)
}

const NUMBER_FIELDS = [
  'pushMultiplier', 'coreRadiusMultiplier', 'chargeExponent',
  'pullMultiplier', 'distanceMultiplier', 'linkExponent',
  'gravityX', 'gravityY', 'gravityBandExp', 'gravityTopological', 'gravityTopologicalExp', 'gravityCenter',
  'alphaDecay', 'alphaMin', 'velocityDecay',
] as const
const BOOLEAN_FIELDS = ['radial', 'topologicalEnabled'] as const
const SCALE_FIELDS = ['baseMul', 'minZoomMul', 'maxZoomMul'] as const

/** The forces as plain data: every number and switch, each tuning by its axis or scalar, each override by its bucket. */
export function forcesToJSON(forces: ForceParams): NonNullable<LayoutJSON['forces']> {
  const tuning = (t: LayoutTuning): LayoutTuningJSON =>
    isScalarTuning(t)
      ? { scalar: t.scalar, ...(t.span ? { span: { ...t.span } } : {}) }
      : { axis: t.mapping.axis, ...(t.overrides.size > 0 ? { overrides: Object.fromEntries(t.overrides) } : {}) }
  const out: NonNullable<LayoutJSON['forces']> = {
    pair: {
      axis: forces.pair.mapping.axis,
      ...(forces.pair.push.size > 0 ? { push: Object.fromEntries(forces.pair.push) } : {}),
      ...(forces.pair.spring.size > 0 ? { spring: Object.fromEntries(forces.pair.spring) } : {}),
    },
    bandX: tuning(forces.bandX),
    bandY: tuning(forces.bandY),
  }
  for (const key of NUMBER_FIELDS) out[key] = forces[key]
  for (const key of BOOLEAN_FIELDS) out[key] = forces[key]
  return out
}

/** The forces a stored record names, over `base`; undefined when a part present is not its shape. */
export function forcesFromJSON(value: unknown, base: ForceParams, taxonomy: Taxonomy): ForceParams | undefined {
  if (!isPlainRecord(value)) return undefined
  const forces = { ...base }
  for (const key of NUMBER_FIELDS) {
    const v = value[key]
    if (v === undefined) continue
    if (!isFiniteNumber(v)) return undefined
    forces[key] = v
  }
  for (const key of BOOLEAN_FIELDS) {
    const v = value[key]
    if (v === undefined) continue
    if (typeof v !== 'boolean') return undefined
    forces[key] = v
  }
  if (value.pair !== undefined) {
    const pair = pairFromJSON(value.pair, taxonomy)
    if (!pair) return undefined
    forces.pair = pair
  }
  for (const key of ['bandX', 'bandY'] as const) {
    if (value[key] === undefined) continue
    const tuning = tuningFromJSON(value[key], taxonomy)
    if (!tuning) return undefined
    forces[key] = tuning
  }
  return forces
}

/** The node scale a stored record names, over `base`; undefined when a field present is not a number. */
export function nodeScaleFromJSON(value: unknown, base: NodeScaleParams): NodeScaleParams | undefined {
  if (!isPlainRecord(value)) return undefined
  const nodeScale = { ...base }
  for (const key of SCALE_FIELDS) {
    const v = value[key]
    if (v === undefined) continue
    if (!isFiniteNumber(v)) return undefined
    nodeScale[key] = v
  }
  return nodeScale
}

/** The mapping a stored axis names: the style axis's from the taxonomy; another axis's without buckets, for the view to complete from the graph. */
function mappingFor(taxonomy: Taxonomy, axis: AxisId) {
  return axis === taxonomy.styleAxis() ? styleIdentityMapping(taxonomy) : identityMapping(namerFor(taxonomy, axis), [])
}

function pairFromJSON(value: unknown, taxonomy: Taxonomy): PairTuning | undefined {
  if (!isPlainRecord(value) || typeof value.axis !== 'string') return undefined
  const push = new Map<string, PushPhysics>()
  if (value.push !== undefined) {
    if (!isPlainRecord(value.push)) return undefined
    for (const [bucket, physics] of Object.entries(value.push)) {
      if (!isPlainRecord(physics) || !isFiniteNumber(physics.charge) || !isFiniteNumber(physics.coreRadius)) return undefined
      push.set(bucket, { charge: physics.charge, coreRadius: physics.coreRadius })
    }
  }
  const spring = new Map<string, SpringPhysics>()
  if (value.spring !== undefined) {
    if (!isPlainRecord(value.spring)) return undefined
    for (const [id, physics] of Object.entries(value.spring)) {
      if (!isPlainRecord(physics) || !isFiniteNumber(physics.strength) || !isFiniteNumber(physics.distance)) return undefined
      spring.set(id, { strength: physics.strength, distance: physics.distance })
    }
  }
  return { mapping: mappingFor(taxonomy, value.axis), push, spring }
}

function tuningFromJSON(value: unknown, taxonomy: Taxonomy): LayoutTuning | undefined {
  if (!isPlainRecord(value)) return undefined
  if (typeof value.scalar === 'string') {
    if (value.span === undefined) return { scalar: value.scalar }
    if (!isPlainRecord(value.span) || !isFiniteNumber(value.span.zero) || !isFiniteNumber(value.span.one)) return undefined
    return { scalar: value.scalar, span: { zero: value.span.zero, one: value.span.one } }
  }
  if (typeof value.axis !== 'string') return undefined
  const overrides = new Map<string, BandRange>()
  if (value.overrides !== undefined) {
    if (!isPlainRecord(value.overrides)) return undefined
    for (const [bucket, band] of Object.entries(value.overrides)) {
      if (!isPlainRecord(band) || !isFiniteNumber(band.min) || !isFiniteNumber(band.max)) return undefined
      overrides.set(bucket, { min: band.min, max: band.max })
    }
  }
  return { mapping: mappingFor(taxonomy, value.axis), overrides }
}

/** Whether two layouts say the same thing — every tuning, override, number and switch — so a host that re-reads its layout from a store each render is not read as a change. */
export function layoutsEqual(a: LayoutState, b: LayoutState): boolean {
  if (a === b) return true
  const key = (l: LayoutState) => { const o = openLayout(l); return JSON.stringify([forcesToJSON(o.forces), o.nodeScale]) }
  return key(a) === key(b)
}
