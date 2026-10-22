# Study — where in its band a node should start (Unit 5a, REVIEW_5a C6)

**Question.** Unit 5a seeded every node at the re-centred centre of its rest band
(T2: seed and force agree). The review (gates-1) measured that this made the
stress layout bimodal across RNG seeds: in about a third of seeds the forty
activities settle wedged above the workflow layer, and the Y-band occupancy
diagnostic (`outsideBand`, deliberately not goldened — D24, D26) jumps from 3/53
to as high as 42/53. The pre-5a seeding, which placed nodes at the *unshifted*
band centre — by accident, 120 units below the frame on stress — never did.

**Method.** `seed-bias.probe.ts` (beside this file; bundle with esbuild and run
with node from `<visualizer>`) builds each fixture, replaces the seed positions
with one of five rules, runs 400 default ticks, and counts Y-band outsiders the
way `tier-b.ts` does. 24 seeds: `0x5eed` and `0x1001`…`0x1017`.

| fixture | rule | mean outside | max | seeds > 10 |
|---|---|---:|---:|---:|
| stress | centred (±h/4 jitter) | 11.9 | 42 | 8/24 |
| stress | unshifted (pre-5a, centre + median) | 3.8 | 16 | 1/24 |
| stress | uniform within the band | 16.5 | 43 | 11/24 |
| stress | centred (±h/2 jitter) | 16.5 | 43 | 11/24 |
| stress | **lower** (centre + 0.35·h, ±h/4) | **3.5** | 13 | 1/24 |
| decomposition | centred | 2.8 | 13 | 1/24 |
| decomposition | unshifted | 2.0 | 2 | 0/24 |
| decomposition | uniform | 3.6 | 15 | 3/24 |
| decomposition | centred (±h/2) | 3.6 | 15 | 3/24 |
| decomposition | **lower** | **2.0** | 2 | 0/24 |
| multifile | every rule | 33.7–34.7 | 38 | 24/24 |

**Reading.** Starting nodes in the middle of overlapping bands (workflow
−20..340 and activity 50..380 after re-centring, centres 55 apart) interleaves
the two tiers and charge alone cannot sort them; the band force only acts on
nodes *outside* their band. A start biased toward the band's bottom edge
pre-orders the tiers — the activity layer begins below the workflow layer —
and the band force only has to lift. The pre-5a seeding did this by accident
(the median happened to be 120 on stress and decomposition); `SEED_BIAS = 0.35`
does it on purpose and on every fixture. Multifile's occupancy is structural
(nexus endpoints and operations sit between bands) and no seeding rule moves it.

**Decision.** D54: seed at the re-centred centre plus `SEED_BIAS × height`, in
the forces' frame. The frame itself is unchanged by the bias, so seed and force
still agree; only where within the band a node starts moved.
