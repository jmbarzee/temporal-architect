# Progress

**§7.2. [living] — the agent owns this file and updates it at EVERY unit
boundary, before starting the next unit.**

If a fresh session cannot tell what to do next from this file plus `PLAN.md`,
**this file is defective and fixing it is the next unit.**

---

## Standing Instructions

> §8.5 steering interface. A human edits this block mid-run to redirect without
> resetting progress. **Re-read it at every unit boundary — it may have changed.**
> These outrank §5.2 principles and §5.3 suggestions; they yield to §4
> constraints.

**SI-1 — Review fan-outs are cost-disciplined from Unit 1 on.** Unit 0's PR
review cost 51 agents and 6.24M subagent tokens to find 4 distinct defects. Keep
the adversarial framing, which is what worked; drop the redundancy, which is what
cost. The rules are in `VERIFICATION.md` §3.5.5 and the reasoning is in D29:

  - 5-6 finders with orthogonal mandates, not 11
  - every finder must break the code and show the gate output
  - cluster findings yourself, then verify **clusters** — cheap model, tight
    prompt, no criteria preamble
  - commit-scope review only where behavior changes
  - no delegated authoring under ~50 lines

Spend heavily anyway on the first review of Units 4, 5a, 5b and 6 — the units
that touch the force model and the gates, where Unit 0 proved a blind spot is
most expensive. Target ~700k-900k per unit instead of 6.6M.
— human, 2026-09-06

---

## Budget

> The runaway ceiling is a **last-resort guard**, not a budget: the plan expects
> ~45 commits and the ceiling is ~7× that. Check it at every unit boundary with
> `git rev-list --count main..HEAD`. If it ever fires, one of the other stop
> conditions should have fired first — say which, in the handoff. Do not raise
> it.

| field | value |
|---|---|
| Runaway ceiling | **300 commits** on `main..HEAD` (enforced; KICKOFF §2.4) |
| Commits so far | 24 |
| Token / wall-clock budget | unset (advisory only) |

---

## Status

| field | value |
|---|---|
| Current unit | none — Unit 6 closed at `4f3c543` + the record; Unit 7 is next and opens on its own branch |
| Last completed unit | **Unit 6 — Colour scheme + node sizes** ([PR #174](https://github.com/jmbarzee/temporal-architect/pull/174)) |
| Feature branch | `visualizer/composable-dimensions` |
| Unit branch | `visualizer/dimensions-unit-6` (#174, from unit-5b @ `a638f19`); the stack below it: unit-5b (#173) → unit-5a (#171) → unit-4 (#169) → unit-3 (#161) → unit-2 → unit-1 → unit-0 → composable-dimensions. The PRs **stack**: each targets its predecessor, not the feature branch (D36). #158 -> composable-dimensions, #159 -> unit-0, #160 -> unit-1, #161 -> unit-2, Unit 4's -> unit-3. Nothing needs to merge for the run to continue. |
| Run state | running |

## Counters

| counter | current | target |
|---|---|---|
| A — requirements covered | **30** (R4, R5, R6, R7, R8, R9, R10, R11, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34) + R1 partial | 42 |
| B — blast-radius sites migrated | **33** | 38 |
| C — leaks in the manifest | **54** | 0 |
| Gate 6 — import-boundary violations | **7** | 0 |

Unit 0 moves none of the three counters by design: it builds the means of
measuring them. Counter A's R41 ("does everything it did before") closes at
Unit 8, not here; Unit 0 only makes it checkable.

Counter B this unit: B1, B2, B8, B9, B14, B18, B31, B32, B36 — Unit 2's whole
declared blast radius, taking the counter 4 -> 13.

Counter C landed at **209** against Unit 2's ceiling of **210** (OQ2 resolved as
D38: §6.5's table binds the gate, §6.2's tighter 150 is the target and was not
reached). Gate 6 landed at **8**, better than the 10 projected, because `build.ts`
carried two violations of its own out of the manifest when it moved. Both ceilings
are ratcheted in `kickoff/gates.json` (583 -> 210, 11 -> 8); the ratchet is
one-way, so these are now the numbers Unit 3 must not exceed.

Where the 374-line drop came from, honestly: most of it is **relocation**, not
deletion — `edge-types.ts` (164), `node-types.ts` (103) and `build.ts` (59) left
the manifest for `src/adapter/`, which is the point of the unit rather than a
dodge, since the vocabulary genuinely belongs to the host. The part that is real
deletion is `model.ts` 61 -> 12 and the `nodeDefType.ts` removal.

**Unit 4.** Counter B: B7 (the O(n²) loop reads each node once), B12 and B13
(`edgeTypeFor` takes values and returns an id; `EdgeTypeId` no longer keys any
param map), B26 (the three `as NodeType` casts are gone — the pattern gate
reports 0 new identity casts), B28 (one token per category *present*, from the
resolved table), B6 (`bandCenters` keys on bucket ids, which are interned
strings by construction — T1's identity hazard is gone; the review corrected
my "not touched") — 18 -> 24. **Carried:** B22 (`edgeStyleFor`, which §6.5
already routes to Unit 6).

Counter C landed at **191** against §6.5's **102**, and the gap is not slippage:
it is the plan's table attributing to Unit 4 drops it elsewhere assigns to other
units. Every remaining leak, by the unit §6.5 itself names for the file: Unit 5a
— `simulation.ts` 5, `GravityControls.tsx` 4, `.css` 2 = **11**; Unit 6 —
`edge-styles.ts` 58 (T11), `FilterBar.css` 39, `GraphView.css` 8, `controls.css`
3, `GraphControlPanel.css` 3, `PinToggle.css` 2, `GraphCanvas.tsx` 3, `groups.ts`
1 = **117**; Unit 7 — `GraphView.tsx` 30, `visibleGraph.ts` 19, `useHighlight.ts`
10 = **59**; residue — `FilterBar.tsx` 2, `dimension.ts` 1, `taxonomy.ts` 1 =
**4**. Sum 191. `model.ts`, §6.5's one Unit 4 residue, is at **zero**: its last
three were comment prose, and the review (c25) caught the close-out calling them
"nexus splice readers" — they were not, and they are reworded. The unit removed
twelve (203 -> 191) while adding a tab, a dropdown and six files to the manifest
at zero. The ratchet is set to **191** / **1243**; the next real drop is Unit 5a's
11.

**Unit 5a.** Counter B: B10 (seeding, both axes at the re-centred band centre),
B11 (the X/Y asymmetry — one `AxisTuning` per axis, one pull rule), B24 (the
overlay calls the engine's band maths), B27 (the bespoke band plot is gone;
`AxisControls` is new code on the shared `Plot` shell) — 24 -> 28.

Counter C landed at **184** against §6.5's **90**. Same shape of gap as Unit 4:
Unit 5a's own files are near their floor — `simulation.ts` 5 -> 3,
`GravityControls.tsx` 4 -> 0, its `.css` 2 -> 1, `AxisControls.tsx` new at 0 —
and what remains is Unit 6's **117** (`edge-styles.ts` 58, `FilterBar.css` 39,
`GraphView.css` 8, `controls.css` 3, `GraphControlPanel.css` 3, `PinToggle.css`
2, `GraphCanvas.tsx` 3, `groups.ts` 1), Unit 7's **59** (`GraphView.tsx` 30,
`visibleGraph.ts` 19, `useHighlight.ts` 10) and a residue of **8**
(`simulation.ts` 3, `FilterBar.tsx` 2, `GravityControls.css` 1, `dimension.ts`
1, `taxonomy.ts` 1). Sum 184, per the gate's own per-file list. The ratchet is
set to **184** / **1236**.

**Unit 5b.** Counter A: R8, R9, R31 and the scalar halves of R28 and R29 —
20 -> 25. Counter B: none planned for this unit and none moved — 28.

Counter C landed at **180** against §6.5's **80**. Same shape of gap as Units
4 and 5a: Unit 5b's own files are at their floor — `scalar.ts` new at 0,
`forces.ts` 0, `simulation.ts` 3 -> 1, `AxisControls.tsx` 0, `visibleGraph.ts`
19 -> 17 — and what remains is Unit 6's **117** (`edge-styles.ts` 58,
`FilterBar.css` 39, `GraphView.css` 8, `controls.css` 3,
`GraphControlPanel.css` 3, `PinToggle.css` 2, `GraphCanvas.tsx` 3, `groups.ts`
1), Unit 7's **57** (`GraphView.tsx` 30, `visibleGraph.ts` 17,
`useHighlight.ts` 10) and a residue of **6** (`simulation.ts` 1,
`FilterBar.tsx` 2, `GravityControls.css` 1, `dimension.ts` 1, `taxonomy.ts`
1). Sum 180, per the gate's own per-file list. The ratchet is set to **180** /
**1232**.

**Unit 6.** Counter A: R10, R11, R15, R16, R21 — 25 -> 30. Counter B: B22
(the renderer's edge classifier is gone), B23 (node bodies read
`color[theme]`), B25 (push rings likewise), B29 (per-value CSS is inline),
B30 (the chip tints are the taxonomy's) — 28 -> 33.

Counter C landed at **54** against §6.5's **58** — under the plan's ceiling
for the first time, by the unit the plan assigned most of the vocabulary to.
Unit 6's own files: `edge-styles.ts` 58 -> gone, `FilterBar.css` 10 -> 1,
`GraphView.css` 8 -> 3, `PinToggle.css` 2 -> 0, `controls.css` 3 -> 0,
`GraphControlPanel.css` 3 -> 0, `GravityControls.css` 1 -> 0. What remains
is Unit 7's **38** (`GraphView.tsx` 24, `useHighlight.ts` 10,
`visibleGraph.ts` 4) and a residue of **16** (`scheme.ts` 3,
`GraphView.css` 3, `GraphCanvas.tsx` 3, `FilterBar.tsx` 2, `taxonomy.ts` 1,
`simulation.ts` 1, `groups.ts` 1, `dimension.ts` 1, `FilterBar.css` 1). Sum
54, per the gate's own per-file list. The ratchet is set to **54** /
**1118**.

## Gate state

| gate | last run | result |
|---|---|---|
| 1 `tsc --noEmit` | Unit 6 close | pass |
| 2 `npm run build:lib` | Unit 6 close | pass |
| 2b `npm run dts-gate` | Unit 6 close | pass — consumer compile clean, `skipLibCheck` off; 10 declaration files reachable from `lib.d.ts`, none private |
| 3 `npm run verify` | Unit 6 close | pass — 7/7 goldens match; Tier C byte-identical across the unit (D3); Tier A's edge lines lose the style column, gain `byStroke`, and its summaries read abbreviations (D57, D58); `static` gains `schemeProbes` |
| 4 `npm run leak-gate` | Unit 6 close | pass — **54 / 54**; **total 1118 / 1118** |
| 5 browser pass | Unit 6 close | pass — five fixtures in both themes with the theme pinned (`unit-6-*.png`, `unit-6-*-dark.png`; `screenshot.mjs` emulates the preference and fails a wrong-theme capture), 0 console errors; by hand on nexus in a dark host: Auto, Light and Dark, the pane light in every token inside the dark shell, chips tinting from the taxonomy in both panes, the choice persisted |
| 5 browser pass (Unit 5b) | Unit 5b close | pass — five fixtures, 0 console errors, panel-open captures on Gravity / Y Axis / Reach (`unit-5b-*`, via `screenshot.mjs --tab/--subtab/--select`); by hand on nexus and stress: Reach on Y, the 1 handle dragged past the 0 handle, radial, Degree on X, both axes back to Type, and exponent 3 on Reach after the cap — no bounce |
| 5 browser pass (Unit 5a) | Unit 5a close | pass — five fixtures, 0 console errors, panel-open captures (`unit-5a-*`); the Gravity tab exercised by hand on multifile: X Axis and Y Axis bodies, the Radial switch re-lays out, rings draw on hover |
| 5 browser pass (Unit 4) | Unit 4 close | pass — five fixtures, counts identical to Units 0–3, 0 application errors; the Push/Pull tab exercised by hand on multifile: Type → File → Pull, tokens fan out, layout reheats, dropdown reads `Type (7 · 13) \| File (2 · 4) \| Kind (7 · 12)`; a second capture per fixture with the panel open (`unit-4-<fixture>-controls.png`), after the review noted the first set showed it collapsed |
| 6 `npm run boundary-gate` | Unit 6 close | pass — **7 / 7** |
| + `npm run pattern-gate` | Unit 6 close | pass — 5 allowlisted, 0 new; a backslash-quote in a stylesheet is a pattern now (REVIEW_6 C1) |
| + `npm run map -- --check` | Unit 6 close | pass — up to date |
| + `npm run surface-gate` | Unit 6 close | pass — 90 names, as committed |

All of it runs as one command: `make check-visualizer` from the repo root.

**Gate 2 was missing from that aggregate for the whole run until Unit 2e.** CI
always ran it via `make build`, so nothing was genuinely unverified — but the
local aggregate is what runs at every commit boundary, and calling it "all gates"
was wrong. `buildlib-visualizer` is now part of the target. The lesson generalises
past this instance: an aggregate command is a claim about coverage, and nothing
was checking that claim against `VERIFICATION.md`'s list.

---

## Requirement coverage (Counter A)

Status: blank = not started · `wip` · `done`.

| R | requirement | unit | proving gate |
|---|---|---|---|
| R1 | Ontology: dimensions, keys, values | 1, 2 | 1 + 3 | `wip` — the container and its four seams land in Unit 1; dimensions themselves are Unit 2 |
| R2 | Nodes carry a dimension map | 2 | 3 |
| R3 | Host-owned node payload field | 2 | 1 |
| R4 | Edge type from node-dimension combinations | 4 | covered (4) — Tier C byte-identical through the dimensional path; Tier A `axes` rows pin the pair rule per fixture |
| R5 | Edges carry `relation` / `dispatch` dimensions | 4 | covered (4) — Tier A edge lines carry both |
| R6 | Common filter interface + staple filters | 3 | covered (3) — descriptors + chain |
| R7 | Global axis backed by a dimension | 5a | covered (5a) — both axes key on a mapping; Tier B pins the X bands |
| R8 | Global axis backed by a computed scalar | 5b | 3 + 5 | `done` — D55; a host scalar reading its own payload is pinned by `scalarProbes.hostScalar` |
| R9 | Computed scalars may traverse the graph | 5b | 3 | `done` — D55; reach, degree and depth read `ReadableGraph` |
| R10 | Colour scheme input, light **and** dark | 6 | 5 | `done` — the taxonomy's `color.{light,dark}` per value and a stroke per edge type (D57); the pane's resolved theme (D58); Gate 5 in both themes |
| R11 | Base node sizes carried by the colour-scheme input | 6 | 5 | `done` — `size` beside `color` on the same object (D14, D57); `schemeProbes.sizes` |
| R12 | Dimensional mapping, non-intersecting enforced | 2 | 1 + runtime throw |
| R13 | Default force dimension configurable | 4 | covered (4) — Gate 5 verified (axis dropdown) |
| R14 | Default filters/selections configurable | 3 | covered (3) — default selections from the taxonomy |
| R15 | Default colours configurable | 6 | 5 | `done` in-tree — through `OntologySpec`; `schemeProbes.secondScheme` builds a second palette; the public surface for it is Unit 8's (D58 §9) |
| R16 | Every label and abbreviation configurable | 6 | 4 | `done` in-tree — labels, abbreviations, chip and dimension labels on the spec; summaries read `abbreviationFor` (D58 §6) |
| R17 | Filter chain: insert before/after, delete | 3 | covered (3) — Gate 5 verified |
| R18 | Empty chain renders small bar with `+` | 3 | covered (3) — Gate 5 verified |
| R19 | Default displayed filters configurable | 3 | covered (3) — declared `filterDimensions` order |
| R20 | Search last, unchanged | 3 | covered (3) — Gate 5 verified |
| R21 | Graph-pane colour-scheme button | 6 | 5 | `done` — Auto / Light / Dark in the bottom cluster, persisted, Gate 5 verified in a dark host (D57, D58) |
| R22 | Push + Pull combined into one view | 4 | covered (4) — Gate 5 verified |
| R23 | Subsections styled like Band/Topological, no switches | 4 | covered (4) — Gate 5 verified |
| R24 | One shared dimension dropdown drives both | 4 | covered (4) — Gate 5 verified |
| R25 | Equation + chart/sliders + force graph per subsection | 4 | covered (4) — Gate 5 verified |
| R26 | "X Axis" / "Y Axis" subsections | 5a | covered (5a) — Gate 5 verified |
| R27 | Y-axis enable switch enters radial mode | 5a | covered (5a) — Gate 5 verified (the Radial switch on the Y sub-tab) |
| R28 | Per-axis mapping-or-scalar dropdown | 5a, 5b | `done` — mappings (5a) and scalars (5b), Gate 5 verified; `layoutAxisKey` is the one spelling |
| R29 | Per-axis equation, varying by kind | 5a, 5b | `done` — the mapping equation (5a) and the scalar one (5b) |
| R30 | Dimensional mapping renders as columns | 5a | covered (5a) — Gate 5 verified |
| R31 | Computed scalar renders as a gradient | 5b | 5 | `done` — the gradient plot with two free ends in the panel, the gradient stripe on the canvas (D55) |
| R32 | Only the active axis's strength slider shown | 5a | covered (5a) — Gate 5 verified |
| R33 | Force graph always beneath the chart | 5a | covered (5a) — Gate 5 verified |
| R34 | Misc section retained | 4 | covered (4) — Gate 5 verified, untouched |
| R35 | Post-filter set determines offered controls | 7 | 5 |
| R36 | Library in a sibling folder, buildable, extractable | 8 | 2 + 6 |
| R37 | Shim first-class, own folder | 2 | 6 |
| R38 | Zero Temporal information or types in the library | 8 | 4 + 6 |
| R39 | No parser changes | all | `git diff --stat tools/lsp tools/wire-types` empty |
| R40 | No new dependencies | all | `package.json` / lockfile diff |
| R41 | Does everything it did before | 8 | every golden green + Gate 5 |
| R42 | Spec aligned to the new model | 9 | review |

**Twenty of these are provable only by Gate 5**, the manual browser pass. That is
the honest cost of a UI requirement set; see KICKOFF §2.1's caveat. Gate 5 has
explicit pass criteria and a committed screenshot — use them.

---

## Completed units

| unit | commits | requirements | blast radius | leak count | review |
|---|---|---|---|---|---|
| **0 — Verification net** | 11 (`ad06e58`…`149634c`) | means of R41 | none migrated | 583 (ceiling 583) | [REVIEW_0.md](reviews/REVIEW_0.md) — 34 findings, all 5 blockers and 23 majors resolved |
| **1 — Inject the taxonomy** | 8 (`df09457`…`2f51558`) | R1 (partial) | B3, B4, B5, B33 | 583 (ceiling 583) | [REVIEW_1.md](reviews/REVIEW_1.md) — 26 findings, all 3 blockers and 11 majors resolved |
| **4 — Push/pull on a chosen dimension** | 14 (`7d81ee0`…`a2d0b1d` + the record) | R4, R5, R13, R22–R25, R34 | B6, B7, B12, B13, B26, B28 | 191 (ceiling 191) | [REVIEW_4.md](reviews/REVIEW_4.md) — 55 findings, 26 clusters, every blocker and major resolved or filed |
| **5a — Two symmetric dimensional axes** | 6 (`5a3481f`…`6ca503d` + the record) | R7, R26, R27, R30, R32, R33; R28, R29 partial | B10, B11, B24, B27 | 182 (ceiling 182) | [REVIEW_5a.md](reviews/REVIEW_5a.md) — 39 findings, 11 clusters, every blocker and major resolved |
| **5b — Computed scalar axes** | 5 (`c69f974`…`28941dd` + the record) | R8, R9, R31; R28, R29 completed | — | 180 (ceiling 180) | [REVIEW_5b.md](reviews/REVIEW_5b.md) — 39 findings, 16 clusters, every blocker and major resolved; one minor filed (#172) |
| **6 — Colour scheme + node sizes** | 4 (`ba93f11`…`4f3c543` + the record) | R10, R11, R15, R16, R21 | B22, B23, B25, B29, B30 | 54 (ceiling 54) | [REVIEW_6.md](reviews/REVIEW_6.md) — 42 findings, 17 clusters, both blockers and every major resolved |

---

## In-flight work

**Unit 3 is closed.** Branch `visualizer/dimensions-unit-3`,
[PR #161](https://github.com/jmbarzee/temporal-architect/pull/161) (base:
`visualizer/dimensions-unit-2`, per D36). `REVIEW_3.md` records 42 findings with
all 3 blockers and all 9 majors resolved-with-sha.

**Read `REVIEW_3.md` before Unit 4.** Two things in it change how the next unit
should be read:

1. **The cost rules worked** — 20 agents/2.00M/29 clusters became 15 agents/
   1.86M/**20** clusters, and the verify stage **refuted** something for the
   first time. Clustering on mechanism rather than file path is what did it.
2. **Rule 8 failed on the run that introduced it** (F17): I wrote "isolation
   applies to every stage that mutates" and then did not set it on the verifiers.
   A rule in a document is not a rule until something executes it.

**Unit 6 is closed** on `visualizer/dimensions-unit-6`, branched from unit-5b
@ `a638f19`; [PR #174](https://github.com/jmbarzee/temporal-architect/pull/174) (base
`visualizer/dimensions-unit-5b`, per D36). Commits: `ba93f11` (opens),
`f512627` (D57), `b687b42` (the checkpoint), the review fixes `4f3c543`
(D58), then the record (`b7a92f2`, and this paragraph's commit). `REVIEW_6.md`:
42 findings in 17 clusters, both blockers and every major resolved in
`4f3c543`. Last checkpoint: the commit that adds this paragraph.

**Read `REVIEW_6.md` before Unit 7.** Both blockers were invisible to every
automated gate and to a browser pass that looked right: a stylesheet has no
type-checker, and a screenshot does not say which rule produced its pixels
(F24). Unit 7 is the filter bar and the view — stylesheet-heavy. Grep the
built CSS for `\\"` after any scripted edit (the pattern gate does now), and
pin the state every capture is taken in.

Ceilings at the Unit 6 close: leak **54**, total **1118**, boundary **7**.

**Unit 5b is closed** on `visualizer/dimensions-unit-5b`, branched from unit-5a
@ `f838d85`; [PR #173](https://github.com/jmbarzee/temporal-architect/pull/173) (base
`visualizer/dimensions-unit-5a`, per D36). Commits: `c69f974` (opens),
`012d0f8` (D55), `3e7b795` (one graph-reading interface), `9e9cb51` (the
checkpoint), the review fixes `28941dd` (D56), then the record.
`REVIEW_5b.md`: 39 findings in 16 clusters, every blocker and major resolved
in `28941dd`; C6 filed as
[#172](https://github.com/jmbarzee/temporal-architect/issues/172). Last
checkpoint: the commit that adds this paragraph.

**Read `REVIEW_5b.md` before Unit 6.** Four of its five lenses converged on
one shape: the scalar path's claims had no reader, because every gate was
written for buckets. Unit 6 injects a palette and node sizes — write the
reader (a probe that renders under a second palette and a second size table)
before the palette.

Ceilings at the Unit 5b close: leak **180**, total **1232**, boundary **7**.

**Unit 5a is closed** on `visualizer/dimensions-unit-5a`, branched from unit-4
@ `34a75a8`; [PR #171](https://github.com/jmbarzee/temporal-architect/pull/171)
(base `visualizer/dimensions-unit-4`, per D36). Commits: `5a3481f` (5a-i/ii,
D53), `aee52c3` (5a-iii), the close-out `9a443aa`, the review fixes `6ca503d`
(D54), then the record. `REVIEW_5a.md`: 39 findings in 11 clusters, every
blocker and major resolved in `6ca503d`. Last checkpoint: the commit that adds
this paragraph.

**Read `REVIEW_5a.md` before Unit 5b.** Its three record errors were one
shape — a measurement on one fixture or one seed, generalised (F21) — and 5b
adds computed scalars, which are all measurement.

Ceilings at the Unit 5a close: leak **182**, total **1234**, boundary **7**.

**Unit 4 is closed** on `visualizer/dimensions-unit-4`, branched from unit-3 @
`aedde37`; [PR #169](https://github.com/jmbarzee/temporal-architect/pull/169)
(base: `visualizer/dimensions-unit-2`'s successor `visualizer/dimensions-unit-3`,
per D36). Eleven unit commits (`7d81ee0` … `acc36cc`: 4-pre D47, 4a D48, 4c
D49, 4d, 4e-i D50, 4e-ii, 4e-iii D51), the close-out `7941464`, the review fixes
`a2d0b1d` (D52), then the record. `REVIEW_4.md` records 55 findings in 26
clusters with every blocker and major resolved-with-sha or filed. Last
checkpoint: the commit that adds this paragraph. **Record the sha, every checkpoint:** on resume after a six-week
pause the app had re-pointed this worktree to its own session branch at the
feature base, and the first `checkout -b unit-4` silently branched from there.
Caught only because pre-Unit-2 symbols showed up in a grep. First action of any
resumed session: `git log --oneline -1` against the sha here.

**Read `REVIEW_4.md` before Unit 5a.** Two things in it change how the next
unit should be run: the review's worktrees start at main (F19 — hand the sha),
and the clusterer must not rate (F20, rule 12 — the verify stage doubled the
spend refuting nothing).

The three things the Unit 3 close said Unit 4 should settle first, settled:

- **The params shape** — D47: `AxisTuning` is one sparse value (mapping +
  overrides), resolved once; D49 extends it to springs and drops the duplicated
  `axis` field. Nothing is stored twice.
- **`ontology.valueOn`'s `defType` special case** — D50: the adapter writes the
  kind onto the node; `valueOn` is one indexer for every axis.
- **The §6.5 ceiling** — not reachable, and the arithmetic is under Counters:
  every remaining leak is a file §6.5 assigns to 5a, 6 or 7.

Carried out of Unit 4: B22 (→ Unit 6); off the style axis every token is one
neutral colour until Unit 6's palette; the pair rule does not read `dispatch`
(a host rule can — D51); host-declared coarsening mappings and a host-declared
default pair axis are one filed issue (REVIEW_4 #19–20).

Ceilings at the Unit 3 close: leak **204**, total **1266**, boundary **7**. At the
Unit 4 close: leak **191**, total **1243**, boundary **7**.

## Discovered facts

> Facts learned during the run that a future session would otherwise rediscover.
> If one contradicts `NON_INFERABLE.md`, say so explicitly and cite both.

**F1 — The §6.5 leak baseline reproduces exactly, per file.** Running the
[immutable] pattern over the 41-file manifest with
`grep -v -E 'https?://' | grep -o -i -E '<pattern>' | wc -l` gives **583**, and
every non-zero per-file count matches `PLAN.md` §6.5's table row for row. The
pattern, the manifest and the counting method are therefore all confirmed
mutually consistent; the Unit 0g script only has to reproduce this command.

**F2 — Gate 6 starts at 11 violations, not 0.** Measured import edges from the
manifest into the forbidden trees: `graph/build.ts` -> `types/ast`,
`types/parser-graph`; `graph/groups.ts` -> `types/decomposition`;
`graph-view/useGraphModel.ts` -> `types/ast`, `types/parser-graph`;
`GraphView.tsx` -> `types/ast`, `types/parser-graph`, `types/decomposition`,
`theme/temporal-theme`; `FilterBar.tsx` -> `types/ast`, `theme/temporal-theme`.
`src/adapter/` does not exist yet and `src/components/blocks/` is imported by
nobody in the manifest — T17's coupling to `blocks.css` is a *stylesheet*
dependency with no import edge, so Gate 6 structurally cannot see it. See D21.

**F3 — CI never runs on a unit PR.** `.github/workflows/ci.yml` triggers on
`pull_request: branches: [main]` and `push: branches: [main]` only. Every unit
PR targets `visualizer/composable-dimensions` (§7.1), so without a trigger change
the six gates would be wired into a workflow that never fires for this run. See
D22.

**F4 — The forces are called from exactly one place.** All five `apply*` forces
are called only from `Simulation.tick`, and `new Simulation(...)` appears only at
`useSimulation.ts:50`. The nine-site RNG injection (0c) therefore has a
single-caller blast radius and needs no param-object plumbing.

**F5 — The `make typecheck` aggregate spares `ci.yml` only from future
*typecheck* gates; every other gate still needs its own edit.** Commit 0a's body
overstated it as meaning `ci.yml` "never has to change again", and that is false
within Unit 0 itself. `VERIFICATION.md` §3.1 Gate 3 has Unit 0 wiring `npm run
verify` into `ci.yml`; `PLAN.md` §6.2 commit 0g wires the leak gate, the boundary
gate and the forbidden-pattern check into it as well; and per T27 a new
`tools/<name>/` package gets no `npm ci` step at all unless one is added there by
hand. Budget a `ci.yml` edit per gate, not one for the whole run.

**F6 — `README.md`'s § Development target menu is now stale, and closing that
drift needs a §4.4 amendment first.** `README.md:245-250` lists `make build /
test / vet / check-types / check-docs` and omits `make typecheck`, which 0a made
a CI-blocking gate; every later gate widens the gap. But `NON_INFERABLE.md` §4.4's
"May write" list does not include `README.md`, so no unit in this run may fix the
menu as the boundaries currently stand — it takes a §8.2 amendment adding
`README.md` to §4.4, or the menu stays out of date for the duration.

**F7 — The simulation freezes at tick 200 with its last velocities still on the
nodes.** `alpha` starts at 1.0 and `alphaDecay` is 0.005, so `tick()` starts
returning early at tick 200 — *before* the velocity-decay step. Nodes stop
displacing, but `vx`/`vy` keep whatever value the last active tick left, which
is why a "mean speed at rest" reading (2.8e-3 to 2.9e-2 across the fixtures)
never approaches `alphaMin × 10`. Anything reasoning about whether the layout
has settled should read `isStable()` or the tick count, never the stored
velocity. See D24.

**F8 — Tier C is the only tier that can see the edge classifier's precedence.**
Demoting the `signalSend` rule below the namespace rule — the one ordering T14
calls load-bearing — turns `edge-types.golden.json` red and leaves **all five
fixture goldens green**. That is T32 reproduced as a measurement: no fixture in
the repository reaches the rule, so without the synthetic table the highest
-precedence branch of `edgeTypeFor` would be entirely unprotected.

**F9 — The forbidden-pattern check cannot see a type alias.** `as Record<` is a
syntactic rule, so `type R = Record<string, X>` followed by `x as R` — or a
`Record<>` wrapped in a helper generic — passes it. Closing that needs type
information, which means a typechecked linter, which means a dependency (C2, so
§8.3). Treat the check as a ratchet on the *obvious* forms, not a proof.

**F10 — KICKOFF §2.3's settle floor is not met as written, on any fixture.**
"The simulation still settles below threshold on the 53-node stress fixture"
reads `alphaMin × 10` = 1e-3 against a mean speed at rest of 2.5e-2 on
`stress-sample` (and 2.8e-3 to 2.9e-2 across the five). The simulation *is* at
rest — it displaces nothing after tick 200 — but the quantity the floor names is
frozen velocity, not motion (F7). The floor is unmeasurable as worded rather
than failing; what replaced it as the goldened settle signal is `ticksToStable`,
plus the short-run position rows that actually respond to the forces.

**F11 — The short-tick position goldens are confirmed stable across platforms.**
They were generated on macOS arm64 and `verify: 7 golden(s) match` on CI's
ubuntu x64 (run 34015151659). That is the exact risk D24 reasoned about and D26
bet against: three ticks of `Math.pow`/`Math.hypot` do not move a position by
1e-6. A 400-tick snapshot would be a different matter and is still not goldened.
CI also ran the three ratchets from a clean `npm ci` with no `dist-verify/`
present, so the harness bootstraps from nothing.

**F12 — Two halves that are each individually correct is this run's dangerous
shape.** Both of the worst findings so far have it: Unit 0's harness goldened
everything except the layout, and Unit 1's taxonomy was resolved through a
container by the renderer and through a module singleton by the engine. Neither
half is wrong on its own, which is exactly why no gate saw either. When a unit
introduces a seam, the question worth asking is not "is this correct" but "what
else resolves the same thing, and does it go through here too".

**F13 — The leaner review shape works.** Unit 1's PR review: 5 agents, 827k
subagent tokens, 26 findings, 24 with reproductions, 3 blockers. Unit 0's: 51
agents, 6.24M tokens, 34 findings, 4 distinct defects. Roughly 7.5x cheaper for
comparable yield. The schema field requiring each finder to report *what it broke
and what the gate said* is doing the work — the two sharpest Unit 1 findings came
from reviewers who sabotaged a value and watched the gates stay green.

**F14 — `gh pr edit` silently no-ops on this repo (ALL flags); use `gh api -X PATCH`.**
Retargeting #159 with `gh pr edit 159 --base visualizer/dimensions-unit-0` printed
only a Projects-classic GraphQL deprecation warning, **exited 0, and changed
nothing** — the PR still read `-> visualizer/composable-dimensions` at 68 files
afterwards. `gh pr edit` resolves the PR through a GraphQL query that selects
`projectCards`, and the deprecation breaks that path before the mutation runs.
`gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -f base=<branch>` works and
returns the new `changed_files` to verify against. This matters because the
zero exit code makes the failure invisible to a script: any automation that
retargets a stack must assert the resulting base, not trust the status. See D36.

*Widened at the Unit 2 close:* it is not just `--base`. `gh pr edit 160 --body`
no-opped the same way — same warning, exit 0, body unchanged — which I only
caught because F14 had already taught me to verify instead of trusting the exit
code. The rule is therefore about the subcommand, not the flag: **use
`gh api -X PATCH repos/<owner>/<repo>/pulls/<n>` for every PR mutation, and read
back a field you just wrote.** `gh pr create` is unaffected (it took `--base`
correctly for #160), as are `gh pr view` / `gh pr checks`.

**F15 — A golden row keeps dead code looking alive; no gate counts readers.**
`nodeDefType.ts` lost its last caller in Unit 2c and stayed in the tree for three
commits with every gate green, because `static-golden.ts` still imported it and
still goldened its output. The row passed, so the module read as load-bearing —
the harness was the only consumer, and a harness-only consumer is
indistinguishable from a real one at gate level. Gate 4 counts vocabulary and
Gate 6 counts import *direction*; neither counts whether anything in the
manifest actually reads a symbol. Generalises past this instance: any symbol the
harness pins is invisible to the ratchets, so **deleting a call site is not the
same as deleting a dependency**, and the lift to check is "who imports this that
is not the harness". See D37.

**F16 — `isolation: 'worktree'` covered only the stage I asked it to, and the
review contaminated itself.** The Unit 2 fan-out set `isolation: 'worktree'` on
the six finders and **not** on the fourteen verifiers, which therefore ran in the
session's own worktree — the live one. Worse, several finders reported sibling
edits appearing under them mid-run: a probe directory materialising and
vanishing, one agent's patch reverted by another, a `filter/storage.ts` that one
lens had moved showing up in another lens's `ls`.

Two of the strongest agents diagnosed this themselves and re-ran everything
against a `git archive HEAD` export in a scratchpad with `node_modules`
symlinked, and said so unprompted — their numbers are the trustworthy ones.

No damage reached the tree (`git status` clean, every gate green afterwards), but
that was luck rather than design, and at least one finder's first run produced a
spurious FAIL it correctly discarded.

**The rule: a fan-out whose agents MUTATE the tree needs isolation on every
stage, not only the stage that obviously edits.** A verifier told to "reproduce
it" edits code by definition. And git-level isolation alone is not enough when
agents also need `node_modules` and a build — the durable pattern is the one
those two agents invented: export a pristine tree, symlink `node_modules`, run
the gates there. Every gate script here resolves against its package root, so it
works unmodified.

**F17 — I wrote the isolation rule and then did not apply it, on the same run.**
§3.5.6 rule 8 says "isolation applies to every stage that mutates, not the
obvious one", written from Unit 2's contamination. The Unit 3 fan-out then set
`isolation: 'worktree'` on the six finders and **not** on the verifiers —
identically to Unit 2 — and a verifier duly reported working in the live
worktree, seeing this session's dev server and in-flight edits.

No damage: the tree was clean afterwards and every gate green. But the rule
failed on the run that introduced it, which says something worth keeping. A rule
written into a document is not a rule until something *executes* it — the same
lesson as F15 (a golden row keeps dead code alive) and D46 (declared policy no
gate reads), one level up. The durable fix is not "remember rule 8"; it is a
workflow template where isolation is not a per-stage option.

**Also recorded: `git stash` stayed untouched throughout** (C6), and the review's
own worktrees were removed afterwards.

---

**F18 — Every pair on a fresh axis starts from one default, so the tokens stack.**
Switching push/pull to the File axis put all four spring tokens at exactly
`DEFAULT_SPRING` and both push tokens on the same declared mean; the control
surface showed one dot. A bounded token count is *necessary* for a usable surface
and not sufficient — coincident tokens are not separately draggable. `ForceMap2D`
now fans coincident tokens out on a ring (drawn position only; a drag still
writes the token's own value). Found by Gate 5 and by nothing else: no number is
wrong when two categories share a default, so no golden can see it.

**F19 — A workflow's isolated worktrees start at main, not at the branch under
review.** All six Unit 4 finders reported a worktree at `712d1b8` (main) where
the prompt named `acc36cc`. Each detached to the right sha — because the prompt
named it and the schema asked for `headSha` — and said so. Nothing in the
Workflow tool carries the session's branch into the worktree it creates. The
durable fix is in the prompt template: state the sha, instruct the detach as
step one, require `headSha` back, and discard any review whose `headSha`
differs without an explicit detach. Recorded in memory as well, since it is
not specific to this run.

**F20 — The clusterer rated severity, and the verify stage doubled the spend.**
Rule 6 made verification conditional on severity, and the clusterer — a cheap
pass meant to group by mechanism — assigned seven clusters "blocker" where the
finders had filed two. Seventeen verifiers ran (Unit 3: eight), refuted none,
and downgraded five of the seven. 3.52M tokens against Unit 3's 1.86M, with the
difference almost entirely in that stage. Rule 12: the clusterer groups; the
triggers for verification are a finder's own claims.

**F21 — One measurement, generalised, is how a record goes wrong.** Twice in
D53: "the X force never fires on any fixture" came from one probe on one
fixture (it fires on three), and "a different basin of the same forces" for
stress's 3/53 → 32/53 came from one RNG seed (over forty, the new seeding was
bimodal and the old never was). Both read as measurements and were
extrapolations. The gates lens caught the second by doing what the claim
implied — forty seeds — and the fix (`SEED_BIAS`) came from the same study,
now committed under `kickoff/studies/` so the number has a source a reader can
re-run. Rule for the record: a claim about "every fixture" or "any seed" names
the fixtures and seeds it was run on, or says it was not.

**F22 — A list of what is in is a list that forgets.** The component manifest
named the library's components; twice in two units the new one was left off
and sat outside every ratchet (REVIEW_4 #6, REVIEW_5a C9). The rule is now the
complement — in unless excluded as the host's — so a new file joins the gates
by existing. The same shape as F15 and D46: a declaration with no reader is a
wish, and a list that must be extended by hand is a declaration.

**F23 — A rule written for an interval is a claim to re-measure when the
interval becomes a point.** The band kernel's dead zone was the band: a node
inside felt nothing, and an overshoot from outside landed inside and stopped.
A scalar's rest is a band of zero height, so the same kernel had nowhere to
land, and at any exponent above 1 the impulse grew faster than the distance
it closed — a period-2 bounce to the velocity ceiling that three-tick short
runs could not see (REVIEW_5b C13). The fix is a cap that was always true of
a well-behaved pull — never past the rest in one tick — and a row that counts
reversals after a nudge. The generalisation: when a model's new case collapses
a range to a point, every rule that leaned on the range's width is a
measurement to retake, not prose to re-read.

**F24 — A claim in a decision is a measurement to take before the record is
written.** D57 said "stored once", "the library no longer depends on the
injector", "sixteen tints and eight overrides gone", "R16 already the
spec's", and "light in a dark host" — and the tree supported none of them
as written (REVIEW_6 C3, C4, C9, C11). Eleven of twelve verifications fired
on "contradicts a decision", and every one confirmed. The record had been
written from the design, with the measurements left to the review. The
reverse order costs nothing: grep for the thing the sentence says is gone,
build the stylesheet the sentence says matches, open the browser in the
state the sentence describes — and write the sentence after. The same
shape as F21 (one measurement, generalised): here, no measurement,
asserted.

---

## Open questions

> §8.4: when a §8.3 halt goes unanswered, the question lands here with the options
> considered and the one you would take — then you move on.

**OQ1 — `PLAN.md` Unit 2 says `**Goldens:** byte-identical`, but Unit 2 deletes
`GraphNode.nodeType` (R2, B1).** The Tier A node rows record a node's identity;
when that identity becomes a dimension map the rows necessarily change shape.
Options: (a) enumerate a permitted golden change limited to the node-identity
rows, exactly as Unit 3's line already does for the filter matrix; (b) have the
Unit 0 harness emit a forward-compatible `dimensions` map now, which means
authoring the dimension model inside Unit 0. **Taking (a)** — (b) violates §5.1
attractor 8 and puts Unit 2's design in the unit that is supposed to only observe
it. Recorded as D17; raised now rather than at Unit 2 so the §8.4 Unit 0
exception covers it.

**OQ2 — `PLAN.md` states two different leak ceilings per unit.** §6.2's per-unit
`**Leak ceiling:**` lines read 583 / 583 / **150** / **138** / **102** / **90** /
**80** / **58** / 0 / 0; §6.5's ceilings table reads 583 / 583 / **210** /
**195** / **160** / **135** / **135** / **60** / 0 / 0. They agree only at Units
0, 1, 7 and 8, so nothing binds until Unit 2. §6.1 gate 4 cites "the unit's
ceiling (**§6.5**)", which argues for the table; §6.2's numbers are tighter, and
a stricter ratchet is never wrong but can force a §8.2 re-flag it did not need.
**Would take: §6.5's table as the gate ceiling, §6.2's line as the unit's
target**, so the gate never blocks on a discrepancy between two documents while
the tighter number still steers the work. Decide at the Unit 2 boundary; it
cannot affect Unit 0, whose ceiling is 583 either way.

**OQ3 — Gate 6 is worded as an absolute prohibition and also as a ratchet.**
`VERIFICATION.md` §3.1 says "No file in the manifest may import from …" and then
"Ratchets like Gate 4: violations may only decrease." At Unit 0 the manifest
already holds 11 such imports, so the absolute reading would make the gate red
from the moment it is wired in and Unit 0 could not close. **Taking the ratchet
reading**, ceiling 11, reaching 0 at Unit 8 where §6.5's manifest becomes the
move list. Recorded as D21; raised here because §8.4 asks for the question as
well as the assumption.

**OQ4 — Two of Tier B's four stated invariants do not hold at baseline, and one
cannot.** Invariant 3 (every node within 5% of its band) is false on all five
fixtures because band gravity is a soft spring against a charge-dominant layout;
invariant 4 (mean speed < `alphaMin × 10`) is structurally unreachable (F7).
**Taking: keep both tolerances untouched, keep both measurements as printed
diagnostics, and golden the layout through position rows instead** — which is
what D26 does after the PR review showed D24's first answer had removed all
layout sensitivity. The open question is whether §2.3's floor and §3.1.1's
invariant 4 should be *reworded* to name motion rather than stored velocity;
that is a change to an [immutable] document and therefore not mine to make.

---

## Defects and their permanent checks

> §3.4: every defect gains a check before its fix counts as done.

| defect | found by | check added | unit |
|---|---|---|---|
| No goldened value depended on a position, a force parameter or the seeded RNG — a whole force kernel could be deleted with every gate green | PR review (5 blockers) | `tierB.seededPositions`, `tierB.afterShortRun` (4 force configurations), `static.forceProbes`, `static.defaultForceParams` | 0 |
| T3's missing-key → NaN path had no detector: `tick()` sanitizes non-finite velocities, so the post-tick assertion was a tautology | PR review | `static.forceProbes.*.allFinite`, read before any clamp | 0 |
| T7's absent-value rule (a node with no source file stays visible under an active file filter) was unreachable from every fixture | PR review | `static.syntheticVisible` — a hand-built graph carrying such a node | 0 |
| Gate 6 missed `'../adapter'`, dynamic `import()`, and multi-line imports whose body line ended in `;` or `=` | PR review | segment matching + deferred-import scan + brace-balance continuation, each negative-tested | 0 |
| The manifest was extension-scoped, so a `.tsx` under `graph-view/` escaped all three ratchets | PR review | globs widened to `.ts`/`.tsx`/`.css` (D27); residual blind spots printed each run | 0 |
| §5.1's "`--write` requires a log entry" was documented, not built | PR review | `verify/run.mjs` refuses `--write` without a `DECISIONS.md` entry that exists and mentions goldens | 0 |
| `signalSend`, the highest-precedence edge rule, is unreachable from the whole corpus | Unit 0 (T32) | Tier C's 294 synthetic rows | 0 |
| The band collection deduplicates by value, and keying it by identity is silent | Unit 0 (T1) | Tier B `bandCentersMatchDistinctTypes`, self-tested red | 0 |
| The three physics accessors fail three different silent ways on an undeclared key: `undefined`, a NaN its `Math.max` floor hides, and a hard throw | Unit 1 (T3, B5) | `static.forceProbes.absentValue` — verified red when the defaults are removed | 1 |
| `edgeCategory` had no such guard, so a supplied taxonomy's category ids write NaN into both endpoint velocities on the first tick (now: a host rule returning an undeclared id throws, loudly, before any tick — `static.tuningProbes.membership`) | Unit 1 review | `static.forceProbes.absentValue.undeclaredEdgeCategory` | 1 |
| `computeVisibleGraph` took an ontology and still resolved its visibility predicate through the module singleton, so a supplied taxonomy emptied the graph | Unit 1 review | `static.ontologyProbes.injection` — verified red when the predicate is reverted | 1 |
| The taxonomy had two unwired suppliers: components read context, `Simulation` read the singleton | Unit 1 review | `Simulation`'s ontology parameter is required, so a call site cannot silently fall back; the compiler is the check | 1 |
| `ABSENT_VALUE_PHYSICS` was documented as inert and is not — a zero charge still couples at half strength and an origin band moves the median | Unit 1 review | `static.forceProbes.absentValue.*.velocities` records **every** node, not just the unknown one | 1 |
