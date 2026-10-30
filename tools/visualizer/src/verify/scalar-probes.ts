// The scalar path's declared invariants, each with a reader: the default span
// per axis, the [0, 1] contract, a node with no value, a degenerate span, and
// the host-scalar extension point that no fixture reaches — a scalar declared
// through the taxonomy, reading its own payload, driving an axis.

import type { Graph } from '@temporal-architect/graph-view/graph/model'
import { readableGraph } from '@temporal-architect/graph-view/graph/model'
import { DEFAULT_TAXONOMY, DEFAULT_TAXONOMY_SPEC } from '../adapter/node-types'
import { createTaxonomy } from '@temporal-architect/graph-view/graph/taxonomy'
import type { Taxonomy } from '@temporal-architect/graph-view/graph/taxonomy'
import type { ForceParams } from '@temporal-architect/graph-view/graph/simulation'
import { defaultParamsFor } from '@temporal-architect/graph-view/graph/simulation'
import type { ScalarAxis } from '@temporal-architect/graph-view/graph/scalar'
import { rangeNormalized } from '@temporal-architect/graph-view/graph/scalar'
import { RADIAL_R_MAX, RADIAL_R_MIN, defaultSpan, layoutFrame, resolvePhysics } from '@temporal-architect/graph-view/graph/forces'
import { FIXTURES } from './fixtures'
import { buildFixtureGraph } from './tier-a'
import type { Json } from './snapshot'
import { sortedRecord } from './snapshot'

function nexus(): Graph {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('scalar-probes: the nexus fixture is missing')
  return buildFixtureGraph(fixture)
}

/** What a call threw, as the row records it; 'returned' when it did not. */
function thrown(run: () => unknown): string {
  try { run(); return 'returned' } catch (e) { return (e as Error).message }
}

/** A frame over the graph for the given Y tuning, under the given taxonomy. */
function frameFor(graph: Graph, taxonomy: Taxonomy, bandY: ForceParams['bandY'], radial = false) {
  const params: ForceParams = { ...defaultParamsFor(taxonomy), bandY, radial }
  return layoutFrame(readableGraph(graph), resolvePhysics(params, taxonomy))
}

/** A taxonomy that adds one host scalar to the shipped spec. */
function withScalar(scalar: ScalarAxis): Taxonomy {
  return createTaxonomy({ ...DEFAULT_TAXONOMY_SPEC, scalars: [scalar] })
}

export function scalarProbes(): Json {
  const graph = nexus()
  const nodes = graph.nodes
  const ids = nodes.map(n => n.id).sort()

  // A host scalar reading its own payload: the id's length, as a fraction of
  // the longest — nothing the built-ins know. Declared through the spec, it
  // drives Y like any built-in, and its rest points follow the ids.
  const idLength: ScalarAxis = {
    id: 'idLength', label: 'Id length', tooltip: 'probe: the id’s length over the longest',
    compute: g => {
      let max = 0
      for (const n of g.nodes) max = Math.max(max, n.id.length)
      return new Map([...g.nodes].map(n => [n.id, max === 0 ? 0 : n.id.length / max]))
    },
  }
  const hosted = withScalar(idLength)
  const hostFrame = frameFor(graph, hosted, { scalar: 'idLength' })
  const hostRests = sortedRecord(nodes.map(n => [n.id, hostFrame.rest('y', n).lo] as const))

  // A scalar that answers for half the nodes: the rest sit at the centre on
  // the axis and on the ring (D55: "a node absent from the answer rests at
  // the centre"), in one place — the frame — for seed, force and overlay.
  const half = new Set(ids.filter((_, i) => i % 2 === 0))
  const partial: ScalarAxis = { id: 'partial', label: 'Partial', tooltip: 'probe: answers for every other node', compute: g => new Map([...g.nodes].filter(n => half.has(n.id)).map(n => [n.id, 1])) }
  const partialFrame = frameFor(graph, withScalar(partial), { scalar: 'partial' })
  const partialRadial = frameFor(graph, withScalar(partial), { scalar: 'partial' }, true)
  const absent = nodes.filter(n => !half.has(n.id))
  const present = nodes.filter(n => half.has(n.id))

  // A degenerate span: every valued node rests at the one point, on the
  // innermost ring in radial, and nothing is NaN.
  const flat = frameFor(graph, DEFAULT_TAXONOMY, { scalar: 'reach', span: { zero: 100, one: 100 } })
  const flatRadial = frameFor(graph, DEFAULT_TAXONOMY, { scalar: 'reach', span: { zero: 100, one: 100 } }, true)

  // A flipped span: the same scalar reads the other way, and the ring rule
  // follows the span's low end, not the score.
  const up = frameFor(graph, DEFAULT_TAXONOMY, { scalar: 'reach' })
  const down = frameFor(graph, DEFAULT_TAXONOMY, { scalar: 'reach', span: { zero: -420, one: 420 } })
  const upRadial = frameFor(graph, DEFAULT_TAXONOMY, { scalar: 'reach' }, true)
  const downRadial = frameFor(graph, DEFAULT_TAXONOMY, { scalar: 'reach', span: { zero: -420, one: 420 } }, true)

  // `normalize: 'none'` is what puts the answer under the [0, 1] contract; by default the frame divides by the largest and 2 is not out of range.
  const outOfRange: ScalarAxis = { id: 'two', label: 'Two', tooltip: 'probe', normalize: 'none', compute: g => new Map([...g.nodes].map(n => [n.id, 2])) }
  const notANumber: ScalarAxis = { id: 'nan', label: 'NaN', tooltip: 'probe', compute: g => new Map([...g.nodes].map(n => [n.id, Number.NaN])) }

  return {
    defaultSpan: { x: { ...defaultSpan(DEFAULT_TAXONOMY, 'x') }, y: { ...defaultSpan(DEFAULT_TAXONOMY, 'y') } },
    // `range` puts the smallest answer at 0 and the largest at 1; answers all alike are 0.
    rangeNormalisation: {
      spread: sortedRecord([...rangeNormalized(new Map([['a', 2], ['b', 4], ['c', 6]]))]),
      flat: sortedRecord([...rangeNormalized(new Map([['a', 3], ['b', 3]]))]),
    },
    contract: {
      outOfRange: thrown(() => frameFor(graph, withScalar(outOfRange), { scalar: 'two' })),
      notANumber: thrown(() => frameFor(graph, withScalar(notANumber), { scalar: 'nan' })),
      duplicateId: thrown(() => withScalar({ ...idLength, id: 'reach' })),
      unknownScalar: thrown(() => frameFor(graph, DEFAULT_TAXONOMY, { scalar: 'not-a-scalar' })),
    },
    hostScalar: {
      offered: hosted.scalars.map(s => s.id),
      rests: hostRests,
      distinctRests: new Set(Object.values(hostRests)).size,
    },
    noValue: {
      absentRestAtCentre: absent.every(n => { const r = partialFrame.rest('y', n); return r.lo === 0 && r.hi === 0 }),
      absentRingAtCentre: absent.every(n => partialRadial.ringOf(n) === 0),
      presentRestAtOne: present.every(n => partialFrame.rest('y', n).lo === -420),
      presentRingOutermost: present.every(n => partialRadial.ringOf(n) === RADIAL_R_MAX),
    },
    degenerateSpan: {
      everyRestAtThePoint: nodes.every(n => flat.rest('y', n).lo === 100 && flat.rest('y', n).hi === 100),
      everyRingInnermost: nodes.every(n => flatRadial.ringOf(n) === RADIAL_R_MIN),
    },
    flippedSpan: {
      restsMirror: nodes.every(n => Math.abs(up.rest('y', n).lo + down.rest('y', n).lo) < 1e-9),
      ringsMirror: nodes.every(n => Math.abs((upRadial.ringOf(n) - RADIAL_R_MIN) - (RADIAL_R_MAX - downRadial.ringOf(n))) < 1e-9),
    },
  }
}
