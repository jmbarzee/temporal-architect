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
| Current unit | **Unit 3 — N-dimensional filters + chain UI** (not started) |
| Last completed unit | **Unit 2 — Dimension primitive + shim folder** (PR #160, REVIEW_2 closed) |
| Feature branch | `visualizer/composable-dimensions` |
| Unit branch | `visualizer/dimensions-unit-2`. The PRs **stack**: each targets its predecessor, not the feature branch (D36). #158 -> composable-dimensions, #159 -> unit-0, Unit 2's -> unit-1. Nothing needs to merge for the run to continue. |
| Run state | running |

## Counters

| counter | current | target |
|---|---|---|
| A — requirements covered | 0 (R1 partial) | 42 |
| B — blast-radius sites migrated | 13 | 38 |
| C — leaks in the manifest | **209** | 0 |
| Gate 6 — import-boundary violations | **8** | 0 |

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

## Gate state

| gate | last run | result |
|---|---|---|
| 1 `tsc --noEmit` | Unit 2 close | pass |
| 2 `npm run build:lib` | Unit 2 close | pass |
| 2b `npm run dts-gate` | Unit 2 close | pass — consumer compile clean, `skipLibCheck` off (**new**) |
| 3 `npm run verify` | Unit 2 close | pass — 7/7 goldens match |
| 4 `npm run leak-gate` | Unit 2 close | pass — **209 / 210**; shim 1068; **total 1277 / 1277** (new) |
| 5 browser pass | Unit 2 close | pass — five fixtures, counts identical to Units 0 and 1, 0 application errors |
| 6 `npm run boundary-gate` | Unit 2 close | pass — **8 / 8**, now resolving re-exports transitively |
| + `npm run pattern-gate` | Unit 2 close | pass — 5 allowlisted, 0 new; now scans the shim too |

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
| R4 | Edge type from node-dimension combinations | 4 | 3 (Tier C) |
| R5 | Edges carry `relation` / `dispatch` dimensions | 4 | 3 (Tier C) |
| R6 | Common filter interface + staple filters | 3 | 3 |
| R7 | Global axis backed by a dimension | 5a | 5 |
| R8 | Global axis backed by a computed scalar | 5b | 3 + 5 |
| R9 | Computed scalars may traverse the graph | 5b | 3 |
| R10 | Colour scheme input, light **and** dark | 6 | 5 |
| R11 | Base node sizes carried by the colour-scheme input | 6 | 5 |
| R12 | Dimensional mapping, non-intersecting enforced | 2 | 1 + runtime throw |
| R13 | Default force dimension configurable | 4 | 5 |
| R14 | Default filters/selections configurable | 3 | 5 |
| R15 | Default colours configurable | 6 | 5 |
| R16 | Every label and abbreviation configurable | 6 | 4 |
| R17 | Filter chain: insert before/after, delete | 3 | 5 |
| R18 | Empty chain renders small bar with `+` | 3 | 5 |
| R19 | Default displayed filters configurable | 3 | 5 |
| R20 | Search last, unchanged | 3 | 5 |
| R21 | Graph-pane colour-scheme button | 6 | 5 |
| R22 | Push + Pull combined into one view | 4 | 5 |
| R23 | Subsections styled like Band/Topological, no switches | 4 | 5 |
| R24 | One shared dimension dropdown drives both | 4 | 5 |
| R25 | Equation + chart/sliders + force graph per subsection | 4 | 5 |
| R26 | "X Axis" / "Y Axis" subsections | 5a | 5 |
| R27 | Y-axis enable switch enters radial mode | 5a | 5 |
| R28 | Per-axis mapping-or-scalar dropdown | 5a, 5b | 5 |
| R29 | Per-axis equation, varying by kind | 5a, 5b | 5 |
| R30 | Dimensional mapping renders as columns | 5a | 5 |
| R31 | Computed scalar renders as a gradient | 5b | 5 |
| R32 | Only the active axis's strength slider shown | 5a | 5 |
| R33 | Force graph always beneath the chart | 5a | 5 |
| R34 | Misc section retained | 4 | 5 |
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

---

## In-flight work

**Nothing in flight. Unit 2 is closed.** Branch `visualizer/dimensions-unit-2`,
[PR #160](https://github.com/jmbarzee/temporal-architect/pull/160) (base:
`visualizer/dimensions-unit-1`, per D36). `REVIEW_2.md` records 31 findings, with
the 1 blocker and all 14 majors resolved-with-sha.

**Read `REVIEW_2.md` before starting Unit 3, not just this file.** Its headline
correction is the thing that changes how the next unit should be read: Unit 2's
`583 -> 209` is **82% relocation, not deletion**, and the relocated vocabulary
grew by 22 on the way across. The gates now measure that (D40's `totalCeiling`),
but the lesson generalises — every remaining unit's leak drop should be stated as
deleted-vs-moved, because the two are not the same accomplishment.

**Two model-design records were added at this boundary** (`PLAN.md` §6.6 and
§6.7). Read them before Unit 4, not after. §6.6 is a retro aimed at whatever
writes the next plan of this kind: the three counters answer *does it work*,
*did you touch it*, and *is the vocabulary gone* — **none of them can see
shape**, so a model can satisfy all three and still store a fact twice with
nothing enforcing agreement. §6.7 is the question to ask once Unit 9 closes,
with one worked candidate.

**Still open, and not decided by me:** whether Unit 3 absorbs the shape work its
descriptor foundation implies, and whether Unit 4 is built with axis + mapping +
table as one constructed value rather than as separate fields. Unit 4 as written
adds a dimension *dropdown*, which moves the axis onto the same edit channel as
`pushMultiplier` — so the choice is cheapest to make before Unit 4 exists, and
the instance count grows from one to roughly five across 4 / 5a / 5b.

**Exact next action: begin Unit 3** (`PLAN.md` §6.2, N-dimensional filters +
chain UI). Its ceilings are already in `kickoff/gates.json` as the Unit 2 close
values and ratchet again at the Unit 3 boundary: leak 210, total 1277, boundary
8. Unit 3's §6.5 target is 195.

Two carried items with named owners, so they are debt rather than drift:
- **Unit 8** closes `GraphView -> adapter/useGraphModel`, the last manifest→shim
  edge a props change removes (D41 — §6.3's precondition was knowingly unmet for
  that one file).
- **Unit 4** takes the absent-value physics policy (D31), the control surfaces'
  unguarded param indexing, and the band-median/ring-guide disagreement.

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
| `edgeCategory` had no such guard, so a supplied taxonomy's category ids write NaN into both endpoint velocities on the first tick | Unit 1 review | `static.forceProbes.absentValue.undeclaredEdgeCategory` | 1 |
| `computeVisibleGraph` took an ontology and still resolved its visibility predicate through the module singleton, so a supplied taxonomy emptied the graph | Unit 1 review | `static.ontologyProbes.injection` — verified red when the predicate is reverted | 1 |
| The taxonomy had two unwired suppliers: components read context, `Simulation` read the singleton | Unit 1 review | `Simulation`'s ontology parameter is required, so a call site cannot silently fall back; the compiler is the check | 1 |
| `ABSENT_VALUE_PHYSICS` was documented as inert and is not — a zero charge still couples at half strength and an origin band moves the median | Unit 1 review | `static.forceProbes.absentValue.*.velocities` records **every** node, not just the unknown one | 1 |
