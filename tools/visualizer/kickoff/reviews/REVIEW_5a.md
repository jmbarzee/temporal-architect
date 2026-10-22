# Review — Unit 5a (two symmetric dimensional axes)

**§3.2 review record. PR scope.** First run under rule 12: five finders (Opus on
physics and gates, Sonnet elsewhere) in isolated worktrees told the sha and
detaching to it; a Sonnet grouper that only groups; severity and the verify
trigger computed from the finders' own claims.

**39 findings, 39 reproduced** (as filed: 5 blocker, 22 major, 12 minor),
across **11 clusters**, **8 verified, 0 refuted** — three of the five
blocker clusters were downgraded by their verifier (one to major, two to
minor). **14 agents, 2.14M subagent tokens.**

Every cluster at blocker or major is resolved in `6ca503d` (D54).

## The rules, measured

| | Unit 3 | Unit 4 | Unit 5a |
|---|---:|---:|---:|
| agents | 15 | 24 | **14** |
| tokens | 1.86M | 3.52M | **2.14M** |
| findings → clusters | 42 → 20 | 55 → 26 | 39 → **11** |
| clusters verified | 8 of 20 | 17 of 26 | **8 of 11** |
| refuted | 1 | 0 | **0** |
| blockers downgraded by verification | — | 5 of 7 | 3 of 5 |

Rule 12 took the spend from 3.52M back to 2.14M with one fewer finder and
sharper clustering (39 → 11: every lens landed on the same five mechanisms).
Eight verifications on eleven clusters is still a lot for zero refutations;
the triggers that fired were "a member filed blocker" (5) and "contradicts a
decision" (3). The finders filed the right blockers this time — C1 is one —
so the stage was not wasted, only redundant. Worth watching, not changing.

What the review was worth: the seed and the force were in **different
frames** at the app's default filter (C1), my own T2 fix had made the stress
layout **bimodal** and D53 had called it chaos (C6), and D53's headline
measurement — "the X force never fires" — was **false on three of five
fixtures** (C7) because I had generalised one probe on one fixture. Three
record errors of my own, caught by the lenses they were written for.

## Blockers (as filed, with the verifier's rating)

| # | cluster | finding | verify | how resolved (`6ca503d`) |
|---|---|---|---|---|
| 1 | C1 | Seed and `seedAt` re-centred on all graph nodes; the force and the overlay on the visible set — at the default filter the seed sat 145–173 units from rest | confirmed, major | One `layoutFrame` over the simulation's whole node set, shared by seeding, the kernels and (through the view) the overlay. A frame over the visible subset would also move on every filter toggle. |
| 2 | C3 | "A band force is acting" tested `gravityX > 0 \|\| gravityY > 0`, mode-blind, in two places: radial with Y at 0 ran with no anchor and drew rings for a force doing nothing; Topological on at strength 0 counted as active | partly, minor | `bandAxesActing` (in radial only Y counts) and `topologicalActing` (switch and strength), one predicate for the tick and the overlay. |
| 3 | C6 | Seeding at the re-centred centre made stress bimodal in the RNG seed (15/40 seeds above 10 outside, max 42/53); D53 called 3/53 → 32/53 chaos | partly, minor | Measured five rules over 24 seeds (`kickoff/studies/seed-bias.md`); `SEED_BIAS = 0.35` of the band height below its centre pre-orders the tiers and gives the pre-5a occupancy on every seed. The frame is unchanged, so seed and force still agree. |

## Majors

| # | cluster | finding | how resolved (`6ca503d`) |
|---|---|---|---|
| 4 | C2 | Radial seeded at cartesian band centres, hundreds of units off the rings; children's X overwritten past their own band; `seedAt` took x verbatim | Radial seeds on the bucket's ring at a random angle (children near their parent's angle); `seedAt` snaps into the frame on both axes, or onto the ring; a child's inherited X is clamped into its band. |
| 5 | C4 | `retunedFor`'s band half lacked the ceiling and the override reset on fallback; `bandX` had no reader | One `refresh` for every tuning, with "fits" the one thing passed in; `tuningProbes.retune.bandAxes` pins X and Y: same object, file dropped, axis vanished, outgrown. |
| 6 | C5 | The absent band `{0,0}` was a declared point shifted by the median and counted in it; an unbucketed node rested at −median, not at the centre D53 claimed | A node in no bucket joins no median and rests at the axis's centre (`pullToBands`); `presentBuckets` returns buckets only. |
| 7 | C7 | D53: "the X force never fires on any fixture; gravityX at 0 or ×4 moves nothing" — false on nexus, taskqueues and multifile after tick 29–54; no probe pinned it | D54 corrects the record; `outsideBandX` is printed beside the Y diagnostic on every run. |
| 8 | C8 | The `seedAt` golden's point was in-band (clamp invisible); the overlay and the hover key had no reader; the surface gate compared names, not reachable types | `seedAt` probed at (−1e4, 1e4) and in radial; the overlay is data (`bandOverlay`) goldened per fixture in both modes; `dts-gate` walks the declaration graph from `lib.d.ts` and refuses a reachable private engine module (10 files reachable, none private). |
| 9 | C9 | `AxisControls.tsx` outside every ratchet — the second new component in two units (REVIEW_4 #6) | The manifest is inverted: every top-level component is in unless excluded by name as the host's. |
| 10 | C11 | Three `as Partial<ForceParams>` casts from computed keys; ~90 lines of dead dual-range CSS and a per-type emitter kept alive by a golden row; pre-5a sentences in the spec and the code | Typed per-axis patches; stylesheet and emitter removed (`generatedCss` row moves); spec and comments rewritten. |

## Minors

C10 (a hovered bucket drawn nowhere dimmed everything; radial on a non-style Y
collapses rings while the plot edits width radial ignores) — resolved: the
overlay dims only when the hovered bucket is drawn, and the Y plot's label
reads "ring: the band centre, innermost first" in radial, in the same slot so
the body does not change height.

## On the review itself

- Rule 12 held: no agent rated another's finding; 14 agents, 2.14M.
- Worktrees started at main again (F19); every finder detached and said so.
- The physics lens found C1, C2, C3, C4, C5 and C7's measurement; the gates
  lens found C6 by running forty seeds where I had run one. The expensive
  lenses earned their tier.
- My own record errors (C6, C7) were both the same shape: one measurement,
  generalised. F21.
