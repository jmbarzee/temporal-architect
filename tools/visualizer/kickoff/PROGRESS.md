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

*(none yet)*

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
| Commits so far | 1 |
| Token / wall-clock budget | unset (advisory only) |

---

## Status

| field | value |
|---|---|
| Current unit | **Unit 0 — Verification net** (in progress) |
| Last completed unit | — |
| Feature branch | `visualizer/composable-dimensions` |
| Unit branch | `visualizer/dimensions-unit-0` |
| Run state | running |

## Counters

| counter | current | target |
|---|---|---|
| A — requirements covered | 0 | 42 |
| B — blast-radius sites migrated | 0 | 38 |
| C — leaks in the manifest | 583 | 0 |
| Gate 6 — import-boundary violations | 11 (baseline, F2) | 0 |

Counter C ceiling for the current unit: **583** (baseline).
Gate 6 ceiling for the current unit: **11** (baseline, D21).

## Gate state

| gate | last run | result |
|---|---|---|
| 1 `tsc --noEmit` | kickoff | pass (1.6s) |
| 2 `npm run build:lib` | kickoff | pass (2.3s) |
| 3 `npm run verify` | — | not built yet (Unit 0) |
| 4 `npm run leak-gate` | kickoff | baseline 583 measured by hand |
| 5 browser pass | kickoff | pass — graph renders, all four Controls tabs functional |
| 6 `npm run boundary-gate` | — | not built yet (Unit 0) |

---

## Requirement coverage (Counter A)

Status: blank = not started · `wip` · `done`.

| R | requirement | unit | proving gate |
|---|---|---|---|
| R1 | Ontology: dimensions, keys, values | 1, 2 | 1 + 3 |
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
| — | — | — | — | — | — |

---

## In-flight work

*Nothing in flight.*

<!-- When a session is interrupted mid-unit, record:
     - the unit, and which of its commits landed
     - the exact next action
     - the WIP commit sha (message prefix `WIP(<unit>):`) and whether it is red
-->

---

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

---

## Defects and their permanent checks

> §3.4: every defect gains a check before its fix counts as done.

| defect | found by | check added | unit |
|---|---|---|---|
| — | — | — | — |
