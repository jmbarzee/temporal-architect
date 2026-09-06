// The golden harness's typechecked half.
//
// A CHARACTERIZATION harness, not a correctness one: it captures what the code
// does today with no opinion about whether that is right. Known defects are
// locked in *as documented defects*; un-locking one is a deliberate golden diff,
// never an accident.
//
// This half is pure computation and its only output is one `console.log` of the
// whole snapshot. It touches no filesystem, reads no argv, and imports its
// fixtures as JSON — `console` comes from the DOM lib, so it needs no node
// typings, which is the entire reason for the split (D10, T33). `verify/run.mjs`
// is the other half: it spawns this bundle, diffs against the committed
// goldens, and owns the exit code.

import { FIXTURES } from './fixtures'
import { buildFixtureGraph, tierA } from './tier-a'
import { seededSimulation, tierB } from './tier-b'
import { tierC } from './tier-c'
import { staticGolden } from './static-golden'
import { canonical } from './snapshot'
import type { Json } from './snapshot'

function snapshot(): Json {
  const out: { [k: string]: Json } = {}

  for (const fixture of FIXTURES) {
    const graph = buildFixtureGraph(fixture)
    // One simulation per fixture, seeded, shared by both tiers. Tier A reads
    // only ids, types and parentage — never positions — so taking it before the
    // ticks would make no difference; taking it from the same instance keeps
    // the two tiers describing one object rather than two.
    const sim = seededSimulation(graph)
    const a = tierA(fixture, sim, graph)
    // tierB ticks the simulation, so it must run second.
    const b = tierB(fixture.name, sim)
    out[fixture.name] = { tierA: a, tierB: b }
  }

  out['edge-types'] = tierC()
  out['static'] = staticGolden()
  return out
}

console.log(JSON.stringify(canonical(snapshot()), null, 2))
