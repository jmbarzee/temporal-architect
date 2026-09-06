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
| Current unit | **Unit 0 — Verification net** (not started) |
| Last completed unit | — |
| Feature branch | `visualizer/composable-dimensions` |
| Unit branch | — |
| Run state | not started |

## Counters

| counter | current | target |
|---|---|---|
| A — requirements covered | 0 | 42 |
| B — blast-radius sites migrated | 0 | 38 |
| C — leaks in the manifest | 583 | 0 |
| Gate 6 — import-boundary violations | not measured | 0 |

Counter C ceiling for the current unit: **583** (baseline).

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

*(none yet)*

---

## Open questions

> §8.4: when a §8.3 halt goes unanswered, the question lands here with the options
> considered and the one you would take — then you move on.

*(none open)*

---

## Defects and their permanent checks

> §3.4: every defect gains a check before its fix counts as done.

| defect | found by | check added | unit |
|---|---|---|---|
| — | — | — | — |
