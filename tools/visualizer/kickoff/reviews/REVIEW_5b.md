# Review — Unit 5b (computed scalar axes)

**§3.2 review record. PR scope.** Second run under rule 12: five finders
(Opus on physics and gates, Sonnet elsewhere) in isolated worktrees told the
sha and detaching to it (every one started at main and said so — F19 holds),
a Sonnet grouper that only groups, severity and the verify trigger computed
from the finders' own claims.

**39 findings, 37 reproduced** (as filed: 1 blocker, 19 major, 19 minor),
across **16 clusters**, **9 verified, 0 refuted** — the blocker confirmed at
major by its verifier, three majors downgraded to minor, two "partly". **15
agents, 2.27M subagent tokens, 836 tool uses, 20.7 minutes.**

Every cluster at blocker or major is resolved in `28941dd` (D56); the one
deferral (C6, minor) is [#172](https://github.com/jmbarzee/temporal-architect/issues/172).

## The rules, measured

| | Unit 3 | Unit 4 | Unit 5a | Unit 5b |
|---|---:|---:|---:|---:|
| agents | 15 | 24 | 14 | **15** |
| tokens | 1.86M | 3.52M | 2.14M | **2.27M** |
| findings → clusters | 42 → 20 | 55 → 26 | 39 → 11 | 39 → **16** |
| clusters verified | 8 of 20 | 17 of 26 | 8 of 11 | **9 of 16** |
| refuted | 1 | 0 | 0 | **0** |
| blockers downgraded by verification | — | 5 of 7 | 3 of 5 | 1 of 1 |

The same shape as 5a: a third of the spend is verification that confirmed
everything. The triggers that fired were "contradicts a decision" (7 of 9)
and "filed blocker" (1) and "unreproduced member" (2); every contradiction
was real — D55 had claimed "the force is always on and the sliders mean what
they meant" (false at exp ≥ 2), "computed once per frame" (twice), and a
fallback order the code did not have. The finders filed one blocker and it
was the model's one real defect.

What the review was worth: the point force **oscillated at every exponent
above 1** (C13) and the Tier B short runs could not see it; an **all-zero
scalar read as absence** (C1); a scalar axis **could not follow its taxonomy**
(C9); and the **host-scalar extension point had no reader at all** (C4) —
the unit's headline interface, exercised by nothing. Four of the five lenses
converged on "the scalar claims have no reader" (C2, C3, C4, C7, C14): the
gates were written for buckets and the scalar path slipped past them.

| lens | findings | reproduced | blocker / major / minor |
|---|---:|---:|---|
| physics | 5 | 4 | 1 / 2 / 2 |
| gates | 6 | 5 | 0 / 3 / 3 |
| surface | 6 | 6 | 0 / 4 / 2 |
| model | 13 | 13 | 0 / 6 / 7 |
| record | 9 | 9 | 0 / 3 / 6 |

## Clusters, as computed (severity = max filed; verdict where verified)

| cluster | severity | verdict | members | mechanism | resolution |
|---|---|---|---|---|---|
| C13 | blocker | confirmed (major) | physics-1 | The scalar force at exponent >= 2 has no dead zone and oscillates, and Tier B runs too few ticks to observe it. | `bandForce` returns at most |d| — the pull reaches the rest, never beyond it — on both axes and the ring; Tier B `scalarSettlesAtExp3` pins it (0.000 reversals, speeds 0.001–0.9 against the finder's 47.7) (D56 §1) |
| C1 | major | confirmed (minor) | physics-3, surface-1, model-4 | Reach/Degree/Depth return an empty map for a zero normaliser, which the axis reads as 'no value' and rests at world 0 instead of the real score 0 at the span's zero end. | the built-ins answer a true 0 at a zero maximum (D56 §2) |
| C10 | major | — | model-2, model-8, model-9 | Narrowing and kernel plumbing between the union arms is mis-factored (the forces.ts and simulation.ts import cycle, the unused mappedAxis, the dead resolved parameter), leaving duplicated routes to one fact. | `ScalarSpan`/`ScalarTuning`/`isScalarTuning` in scalar.ts — no value import from simulation.ts into forces.ts; `resolved` dropped from both band kernels; `mappedAxis` used by `AxisControls` (D56 §9) |
| C12 | major | — | model-5 | The frame's answer for a node with no value is re-defaulted independently by seed, force and diagnostic, with agreement unpinned. | `LayoutFrame.rest`/`ringOf` answer the centre themselves; seed, force and diagnostic read them without a default (D56 §2) |
| C14 | major | — | gates-3 | The public-surface gates compare only export names, so D55's claim that the ontology stays private is unchecked. | dts gate's PRIVATE list refuses a reachable `graph/ontology.d.ts` or `graph/scalar.d.ts` (D56 §11) |
| C2 | major | confirmed (major) | physics-2, gates-1, gates-2, record-2, surface-2 | No golden exercises the scalar X axis, a zero<one or flipped span, or a degenerate span, since every scalar scenario uses Y's default span, so span-direction and ring-rule claims go unchecked. | Tier B `xDegree`, `yReachFlipped`, `yReachFlippedRadial`, `overlayScalarYFlipped`; `scalarProbes.defaultSpan`, `degenerateSpan`, `flippedSpan` (D56 §6, §5) |
| C3 | major | — | gates-5, model-3 | The scalar compute() [0,1] contract is documented but never clamped, finite-checked, or validated, so out-of-range or NaN values reach rest points and ring radii. | `layoutFrame` checks every scalar answer — finite, in [0, 1] — and throws naming scalar and node; `scalarProbes.contract` pins the messages (D56 §4) |
| C4 | major | confirmed (minor) | gates-4, model-1, record-3 | The host-scalar extension path (OntologySpec.scalars, duplicate-id refusal, absent-node-at-centre, node-metadata access) has no consumer or probe in any gate, so D55's claims about it are unchecked. | `scalarProbes.hostScalar` declares a payload-reading scalar through `OntologySpec.scalars` and records its rests; `noValue` pins the centre on axis and ring; `contract.duplicateId` pins the refusal (D56 §5) |
| C5 | major | confirmed (minor) | physics-5, surface-4, record-1 | resolvePhysics throws on an unknown scalar id during GraphView's render with the old tuning and new ontology, before the retunedFor effect can fall back, contradicting the comment and D55 and untested in order. | `useSimulation` retunes in render and the raw state catches up in an effect; the simulation takes params after the retune; the `resolvePhysics` comment now true (D56 §7) |
| C7 | major | — | surface-3, model-10, record-8 | A layout-axis choice has no single identity: the scalar:/mapping: key encoding is spelled at many sites, the kind is carried twice (params and resolved), and no gate checks the control surface, so options, reader and render can drift. | `layoutAxisKey` — one spelling — for options and tunings; `tuningProbes.layoutAxisKeys` pins uniqueness and the round trip; `AxisControls` branches on the resolved axis and narrows with `mappedTuning`, the silent `null` gone (D56 §8) |
| C9 | major | partly (minor) | model-6, model-7 | The scalar default span is stored densely in the tuning and re-derived by its own min/max fold instead of the shared declaredBand fold, so it cannot follow the taxonomy and duplicates logic with a different empty answer. | `ScalarTuning.span` optional; `defaultSpan` in forces.ts on the `declaredBand` fold, filled by `resolvePhysics` (D56 §3) |
| C11 | minor | partly (minor) | physics-4, model-12 | Reach and the ReadableGraph interface are inconsistent about the visible subgraph: reach walks its own byId map and ignores getNode, so hidden ancestors leak into the answer and getNode is half-read. | reach walks `getNode` and stops at an ancestor the graph does not hold; all three built-ins read `getNode` (D56 §10) |
| C15 | minor | confirmed (minor) | gates-6 | screenshot.mjs decides its exit status from errors alone and ignores failed tab, subtab and select actions, so it exits 0 on the wrong panel. | `screenshot.mjs` exits 1 when a panel step did not apply (D56 §11) |
| C16 | minor | — | surface-6 | ScalarPlot's gradient id is per axis rather than per instance, so two visualizers on one page share the document-global SVG id. | `React.useId()` for the gradient (D56 §11) |
| C6 | minor | — | surface-5, model-11, model-13, record-6 | Scalar scores and the layout frame are recomputed on every setParams and again in GraphView's memo (and per axis), and layoutAxisOptions re-measures what GraphView already holds, contradicting the 'computed once' claim. | `layoutAxisOptions` takes the axes the view measured (half the cluster, in `28941dd`); the view's own frame beside the simulation's is filed as [#172](https://github.com/jmbarzee/temporal-architect/issues/172) (D56 §12) |
| C8 | minor | partly (minor) | record-4, record-5, record-7, record-9 | Prose and spec are left describing the old bucket-only or different model (Gravity section, headers, plot orientation, depth versus reach naming, omitted rendered elements) and the leak-ceiling gap is unexplained. | spec § Gravity names both kinds, calls the quantity reach, states the one-frame rule, says how the X plot reads (and the plot draws so); code headers; leak-ceiling gap reconciled in PROGRESS (D56 §11) |

## Findings, as filed

- **physics-1** [blocker] Scalar axis at exponent >= 2 oscillates every tick, and Tier B cannot see it — `src/graph/forces.ts:773`
- **physics-2** [major] Only default-span Reach-on-Y is pinned: the X-scalar path and span direction are unchecked — `src/verify/tier-b.ts:77`
- **physics-3** [major] An all-zero scalar answers 'no value' for every node, so the gradient draws them at 0.5 or off the span — `src/graph/scalar.ts:65`
- **physics-4** [minor] Reach over the 'visible subgraph' answers for hidden ancestors and normalises by them — `src/graph/scalar.ts:84`
- **physics-5** [minor, unreproduced] The guard on the unknown-scalar throw runs after the render that throws — `src/components/GraphView.tsx:178`
- **gates-1** [major] Every scalar-axis golden uses one span (Y's default), so the span's orientation, the X scalar axis and the radial ring rule are untested — `src/verify/tier-b.ts:77`
- **gates-2** [major] The degenerate-span guard (|| 1) in ringOf is untested; without it, radial seeds every node at NaN — `src/graph/forces.ts:327`
- **gates-3** [major] D55's claim that the ontology is not on the public surface is not checked; OntologySpec and ScalarAxis can be published while both type gates pass — `verify/dts-gate.mjs:77`
- **gates-4** [minor] Two D55 invariants are not checked: 'a node absent from the scalar's answer rests at the centre' and 'a duplicate scalar id is refused' — `src/graph/forces.ts:308`
- **gates-5** [minor] The [0, 1] contract on ScalarAxis.compute is not enforced; a value outside it gives negative or NaN ring radii — `src/graph/scalar.ts:20`
- **gates-6** [minor, unreproduced] screenshot.mjs exits 0 when --tab, --subtab or --select did not apply — `verify/screenshot.mjs:242`
- **surface-1** [major] Reach/Degree/Depth answer an empty map on a graph with no dependency edges (or no nesting), so every node rests at the span's midpoint instead of the 0 end — `src/graph/scalar.ts:65`
- **surface-2** [major] Scalar X, non-default spans and Degree/Depth on a layout axis are reached by no golden: three sabotages stayed green on every gate — `src/graph/forces.ts:302`
- **surface-3** [major] The control surface's value encoding, onAxisChange patch and ScalarPlot are under no gate: a broken option value passes everything and the dropdown then shows the wrong axis — `src/components/AxisControls.tsx:109`
- **surface-4** [major] A scalar tuning stores an id that the ontology resolves in render, so a taxonomy swap throws in GraphView's resolved memo before retunedFor can repair it — `src/graph/forces.ts:176`
- **surface-5** [minor] The scalar is computed twice per param edit: once in Simulation.setParams and once in GraphView's frame memo, whose scores are never read — `src/components/GraphView.tsx:188`
- **surface-6** [minor] The scalar plot's gradient id is per axis, not per instance, so two visualizers on one page share it — `src/components/AxisControls.tsx:192`
- **model-1** [major] Host-scalar extension point (OntologySpec.scalars) has no consumer in any gate — `src/graph/ontology.ts:218`
- **model-2** [major] New runtime import cycle forces.ts <-> simulation.ts against forces.ts's own header — `src/graph/forces.ts:19`
- **model-3** [major] Scalar contract 'answers in [0,1]' is stated four times and enforced nowhere; NaN reaches the seed — `src/graph/forces.ts:309`
- **model-4** [major] Zero-normaliser guards return the empty map, which the frame reads as 'no value', not 0 — `src/graph/scalar.ts:111`
- **model-5** [major] Seed and force each re-spell the frame's answer for a node with no value; agreement is unpinned — `src/graph/simulation.ts:588`
- **model-6** [major] Default scalar span is stored densely in the tuning, so it cannot follow the taxonomy — `src/graph/simulation.ts:254`
- **model-7** [minor] defaultSpan re-folds the typical declared band that forces.ts already folds, with a different empty answer — `src/graph/simulation.ts:243`
- **model-8** [minor] applyBandGravity's `resolved` parameter is dead; `void resolved` exists only to silence noUnusedParameters — `src/graph/forces.ts:798`
- **model-9** [minor] mappedAxis, the third narrower, has no production caller; the harness spells a fourth — `src/graph/forces.ts:99`
- **model-10** [minor] A layout-axis choice has no single identity; the dropdown key is spelled at eight sites and unchecked — `src/components/AxisControls.tsx:79`
- **model-11** [minor] Every setParams rebuilds the frame, re-running every selected scalar, and GraphView does it again — `src/graph/simulation.ts:728`
- **model-12** [minor] ReadableGraph.getNode is read by one of three built-ins; reach rebuilds its own lookup — `src/graph/scalar.ts:71`
- **model-13** [minor] layoutAxisOptions re-runs the whole axisOptions measurement GraphView already holds as `axes` — `src/graph/simulation.ts:230`
- **record-1** [major] A taxonomy swap throws in render before retunedFor can fall the scalar back; D55 s6 and the code comment say the opposite — `src/graph/forces.ts:175`
- **record-2** [major] No gate runs a scalar span with zero < one: the X default and a flipped span (radial ring rule) are unpinned — `src/graph/simulation.ts:250`
- **record-3** [major] The host-scalar path (R8's 'node-metadata access', duplicate-id refusal, the [0,1] contract) is reached by no gate, and no host can reach it — `src/graph/ontology.ts:170`
- **record-4** [minor] The spec/D55 say a new scalar axis 'reads like a chart: 1 at the top', but the X plot draws 1 below 0; the spec omits most of what ScalarPlot renders — `spec/GRAPH_VIEW.md:495`
- **record-5** [minor] Spec § Gravity and four code headers still describe the bucket-only model, and the spec's 'each tick ... visible set' has been false since D54 — `spec/GRAPH_VIEW.md:175`
- **record-6** [minor] 'Scores are computed once per frame' (D55 s3) is false: once per axis, and again on every setParams and every view memo, even for a patch that moves no band — `src/graph/forces.ts:299`
- **record-7** [minor] The leak-ceiling gap (PLAN 80, table 135, gate 180) is not explained or flagged in the unit's own record — `kickoff/PLAN.md:194`
- **record-8** [minor] AxisControls renders nothing, silently, when params and resolved disagree on the axis kind, though a loud narrowing (mappedAxis) exists — `src/components/AxisControls.tsx:141`
- **record-9** [minor] The spec calls the topological quantity 'depth' (and 'unlike raw reach count'), while the built-in named Reach is that quantity and the one named Depth is containment depth; reach differs between the two consumers at the default filter — `spec/GRAPH_VIEW.md:176`

## What did not reproduce

- physics-5 (the render-order throw) — reproduced at function level by the
  finder, not through React; its cluster C5 was verified and confirmed by
  code order, and fixed.
- gates-6 (`screenshot.mjs` exits 0 on a missed step) — the finder read it
  and did not run it; the verifier ran headless Chrome against a missed
  label and confirmed it. Fixed.

## Notes from the finders

- physics: The worktree started at 712d1b8 and I detached it to 3e7b795. All sabotage edits were reverted, I removed the node_modules symlink, and make check-visualizer is green on the clean tree. Cleared without a finding: (1) the early-out matches a brute-force definition on 3000 random forests and does not depend on node order; (2) seed and force agree for both axis kinds in cartesian and radial; (3) a degenerate span's `|| 1` behaves as ringRadii does; (4) the scalar is not recomputed per tick or per frame, only per setParams and the view memo, about 3.6 ms at N=1000. Soft observation: at default strength, Reach on Y leaves nodes on average 138-215 units from their rest point (the span is 840), with pairwise order concordance of 0.885-0.973.
- gates: The worktree started at 712d1b8; I detached to 3e7b795. The baseline make check-visualizer was all green. The golden claims in D55 hold when the JSON is decoded: the diff only ADDS tierA.scalars, afterShortRun.yReach and yReachRadial, overlayScalarY, and static tuningProbes.retune.bandAxes.scalar. edge-types is identical. The one removed line is the trailing comma. downstreamScores equals scalars.reach in both keys and values on every state where the visible graph is the whole graph (2 per fixture). The leak gate does measure scalar.ts and AxisControls.tsx: putting 2 domain words in scalar.ts gave `leak count: 182 (ceiling 180)` FAIL. Sabotages the gates caught: flipping restOn's sign (5 goldens FAIL), widening the scalar rest into a band (5 FAIL), copying the tuning on retune (static FAIL, graphChangeKeepsIt false).
- surface: Worktree started at 712d1b8; detached to 3e7b795 (detached). node_modules symlinked. All sabotages reverted (git status shows only the symlink). Experiments are esbuild bundles plus react-dom/server in the scratchpad; no browser. Found sound: dropdown encoding matrix, drag maths, gradient direction, no negative fillRect, pair dropdown mappings-only by type. Unfiled: AxisControls renders null silently when params and resolved disagree on axis kind (SSR: dropdown scalar:reach, no plot; mappedAxis, the loud accessor, is read only by src/verify); host scalars answering NaN/7/-3 are unvalidated against [0,1] (latent, ontology private); canvas gradient stops differ by about 3% luminance at alpha .12 (computed, unviewed).
- model: Worktree started at 712d1b8; ran `git checkout --detach 3e7b795` (detached). Baseline reproduced green (tsc, verify 7/7, build:lib; other gates green in the sabotage runs). Every sabotage reverted; git status shows only the node_modules symlink. Not filed: ringOf and ringRadii both spell RADIAL_R_MIN + t*(MAX-MIN), but each is pinned by its own golden row (inspected, not run); BandStripe.gradient duplicates lo/hi, but the golden prints both (inspected). Browser not used.
- record: detached: worktree started at 712d1b8 (main), I ran git checkout --detach 3e7b795 and reviewed there. All gates green at 3e7b795 (tsc, verify 7/7, leak 180/180, total 1232/1232, boundary 7/7, patterns 0 new, surface 90, map up to date, build:lib, dts-gate). Every sabotage was reverted. Delivered: R9, R28, R29, R31 and the structural half of R8; the plan and D55 hold up on the golden-change claims, the three commit messages and screenshot.mjs's header.
