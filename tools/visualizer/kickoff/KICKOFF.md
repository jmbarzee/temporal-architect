# Kickoff — Composable Dimensions & Agnostic Graph Library

**Entry point for the kickoff set. §1, §2, §5, §7, §8. [immutable] unless a
heading says otherwise.**

## Read order (the cold-start test)

A fresh session with zero conversational memory resumes from files alone. Read in
this order, every time:

1. **`KICKOFF.md`** (this file) — mission, done, principles, escalation, protocol
2. **`NON_INFERABLE.md`** — constraints and the trap list. Skimming this is how
   runs get lost; the traps are silent-failure classes, not style notes
3. **`VERIFICATION.md`** — the gates and how to run them
4. **`PROGRESS.md`** — where the run actually is, and any standing instructions
5. **`DECISIONS.md`** — what has already been settled; do not relitigate
6. **`PLAN.md`** — find the next unit
7. `git log --oneline -20` and the diff of the most recent unit

Then start the next unit. If steps 1–7 do not tell you what to do next,
`PROGRESS.md` is defective — fix it first, as its own commit.

**Binding-force gradient.** When layers conflict, higher wins, no escalation
needed:

> §4 hard constraints **>** §5.1 friction **>** §5.2 principles **>** §5.3 suggestions

---

# 1. Mission & Boundaries [immutable]

## 1.1 Mission

The visualizer identifies every node by a single string (`nodeType: 'workflow'`),
and every feature — colour, forces, filters, layout — is hardwired to that one
axis. Replace it with a **composable dimension model**, where a node carries a map
of dimension → value (`{ temporalType: 'workflow', sourceFile: 'nexus.twf' }`) and
each feature elects **one** dimension to operate on. Then extract the result as a
**wholly Temporal-agnostic graph-visualization library** into a new sibling
package, leaving behind a thin, first-class shim that converts parser JSON into
the library's input. The rendering engine, force model, and control surface are
strong and stay recognisable; this is a generalisation, not a rewrite. When it is
done the visualizer does everything it did before and more, and the library could
be lifted into an independent project without carrying a single Temporal concept
with it.

## 1.2 Non-goals

Scope stated as prohibitions. Each is cheap insurance against the drift that long
runs produce.

- **Do not change the Go parser or its JSON output.** Not even additively. (C1)
- **Do not add dependencies.** Runtime or dev. (C2)
- **Do not split the visualizer spec.** Align it to the new model in place. The
  split is a later, separate decision.
- **Do not rewrite or generalise the tree view.** `TreeView.tsx`,
  `components/blocks/*`, and the three `WorkflowCanvas` contexts stay Temporal and
  stay in the visualizer.
- **Do not write backwards-compatibility shims** for internal APIs — no
  deprecated aliases, no dual-read fields that outlive their unit. (C5)
- **Do not redesign the forces modal's visual language.** Recombine the existing
  components; the equation / chart+sliders / force-curve triad is the house style
  and stays.
- **Do not improve layout physics opportunistically.** Tuning changes are not
  refactor changes. A golden diff you did not intend is a defect.
- **Do not add a test framework.** The harness is bespoke and zero-dependency by
  design. (§3.1.1)
- **Do not touch the distribution repo.**
- **Do not build a per-pair push matrix.** None exists today (T21); adding one is
  new physics and new scope.

## 1.3 Current state — the surprises only

Everything else is readable from the tree. These are not:

- **There is no safety net.** Zero tests, zero lint, and CI never typechecks the
  visualizer. See `VERIFICATION.md` §3.0.
- **The committed fixture cannot exercise the risky paths** — no nexus, no
  coarsened edges, one source file. And `signalSend`, the highest-precedence edge
  rule, is unreachable from the entire `.twf` corpus. (T32)
- **Two edge classifiers already disagree with each other.** (T11)
- **The canvas's node colours have never been theme-aware.** Other canvas colours
  do resolve from CSS variables; node fill and border read light-theme hexes.
  Fixing it is unavoidable here and visibly changes dark mode. (T15)
- **Several behaviors that look like inconsistencies are load-bearing** —
  opposite empty-set semantics, asymmetric focus and reheat policies. (T7–T9)
- **Three pieces of repository plumbing are already broken** and will be tripped
  over: `tsconfig.node.json`, the harness component map, and a review reference to
  a file that does not exist. (T26–T28)
- **The spec contradicts itself** about whether `GraphNode.level` exists. (T29)

Read `NON_INFERABLE.md` in full before writing code. It is the highest-value
document in this set.

## 1.4 Definitions

Terms where your default vocabulary would diverge from this project's.

| term | meaning here |
|---|---|
| **Dimension** | A named axis of node identity, e.g. `temporalType`, `sourceFile`. A node carries a value for each. Unifies with the existing `FilterDimension` — see T24 |
| **Dimension value** | One value on an axis, e.g. `'workflow'`. Must resolve to a stable interned string key (T1) |
| **Dimensional mapping** | A function from a dimension's values to an equal-or-smaller set, whose result sets must be **non-intersecting**. `VIEW_FILTER_ENTRIES`' three-nexus-types → one "Nexus" chip is the existing example |
| **Ontology** | The declared set of dimensions, their possible values, ordering, labels/abbreviations, empty-set semantics, and absent-value policy. Supplied by the host; the library never authors one |
| **Library** | The agnostic package in the new sibling folder. Zero Temporal types, strings, or concepts |
| **Shim** | The Temporal-specific converter under `tools/visualizer/`. Owns the parser wire shapes, the Temporal ontology, and every impedance mismatch |
| **Denominator** | §2.1's enumeration. "Converged" means coverage of it, never "looks done" |
| **Golden** | A committed snapshot of current behavior. See `VERIFICATION.md` §3.1.1 |
| **Leak** | A Temporal-domain literal appearing in the library-to-be tree |
| **Unit** | One commit-sized piece of work, independently completable and independently verifiable |

---

# 2. Definition of Done [immutable]

## 2.1 The denominator

Three counters. All three must reach target. None is a judgment call.

### Counter A — requirements covered (0 / 42)

Tracked in `PROGRESS.md` § Requirement coverage, which carries one row per
requirement with its unit and its proving gate.

**Honest caveat:** roughly a dozen of these (R17-R34, the UI-shape ones) are
provable only by Gate 5, the manual browser pass. That gate has explicit pass
criteria (`VERIFICATION.md` Gate 5) and a committed screenshot, which is as
mechanical as a layout requirement gets — but it is a judgment call in a way
Counters B and C are not. Do not pretend otherwise; do not let it slide either.

**Input interface**
- R1 Ontology: declared dimensions, expected keys, possible values per dimension
- R2 Nodes carry a dimension map instead of a type string
- R3 Non-abstract node metadata moves to a host-owned payload field
- R4 Edges connect by id; edge type composed from node-dimension combinations
- R5 Edges carry their own dimension slots (`relation`, `dispatch`) — required by T14
- R6 Common filter interface plus a library of staple filters
- R7 Global axis backed by a dimension
- R8 Global axis backed by a computed scalar, with node-metadata access
- R9 Computed scalars may traverse the graph (topological reach)
- R10 Colour scheme as input — light **and** dark
- R11 Base node sizes as input, and the current defect diagnosed and fixed
- R12 Dimensional-mapping primitive with enforced non-intersecting result sets
- R13 Default force dimension configurable
- R14 Default filters and selections configurable
- R15 Default colours configurable
- R16 Every label and abbreviation configurable

**UI**
- R17 Non-search filters presented as a configurable chain (insert before/after, delete)
- R18 Empty chain renders as a smaller bar with a `+`
- R19 Default displayed filters configurable
- R20 Search unchanged: last filter applied, at the bottom
- R21 Graph pane gains a colour-scheme button
- R22 Push and Pull combined into a single view
- R23 Push/Pull subsections styled like Band/Topological, without enable switches
- R24 One shared dimension dropdown drives push and, implicitly, pull
- R25 Each subsection shows equation, chart + sliders, force graph + sliders
- R26 Global forces split into "X Axis" and "Y Axis" subsections
- R27 The Y-axis enable switch is how radial mode is entered
- R28 Per-axis dropdown selecting a dimensional mapping or a computed scalar
- R29 Per-axis equation, varying by mapping vs scalar
- R30 Dimensional mapping renders as columns
- R31 Computed scalar renders as a gradient in place of the chart
- R32 Only the active axis's strength slider is shown
- R33 The force graph always sits beneath the chart
- R34 Misc section retained
- R35 The post-filter visible set determines which controls are offered (no cruft)

**Extraction**
- R36 Library in a new sibling folder; easy to build and test; extractable standalone
- R37 Shim is first-class, in its own folder under the visualizer
- R38 Zero Temporal information or types in the library
- R39 No parser changes
- R40 No new dependencies
- R41 The visualizer does everything it did before
- R42 The spec is aligned to the new model (aligned, not split)

### Counter B — blast-radius sites migrated (0 / 38)

The enumerated call sites that must change when node type becomes a dimension
map. The 38-row register lives in `PLAN.md` §6.4, assigned per unit, with a status column. A site is migrated when
its unit's gates pass; deferring one requires a `DECISIONS.md` entry.

### Counter C — leaks outside the shim (target 0)

`npm run leak-gate` count over the **41-file manifest** in `PLAN.md` §6.5, using
the fixed pattern declared there. Baseline **583**. Ratcheted down per unit;
monotonic — an increase fails the gate.

Counter C's companion is **Gate 6** (`boundary-gate`), which counts *import
edges* rather than vocabulary. Gate 4 can be satisfied by renaming while the
library still imports the shim; Gate 6 is what closes that. Both must reach 0.

**Discovery may grow the denominator; only a human may shrink it.** (§6.3)

## 2.2 Observable deltas

The mechanical signals that the run is converging:

- Counters A / B / C moving toward target, and never backward
- Goldens byte-identical, or every changed line explained in the unit's commit body
- `tsc --noEmit` clean at every commit
- Leak count monotonically decreasing
- Diff volume per unit shrinking in the back half — early units are structural,
  late units should be small
- Validator findings per unit trending toward zero

## 2.3 Quality floors

Coverage does not count as done unless all of these hold:

- No `NaN` reachable in any position or velocity (Tier B invariant 1)
- No new `as`-casts into a keyed record. The existing ones
  (`ChargeControls.tsx:55,69,139`) are **deleted**, never widened — with
  dimension-scoped ids a cast still compiles and writes bogus keys (T3)
- The simulation still settles below threshold on the 53-node stress fixture
- Every unit's browser pass shows a rendering graph, not an error boundary (T4)
- Every dimension declares `emptyMeans` and an absent-value policy (T7)
- Every dimension value resolves to a stable interned string key (T1)

## 2.4 Stop conditions

Non-success endings. Each has a defined exit, and **a converged failure report is
a valid deliverable.**

| condition | detection | exit |
|---|---|---|
| Budget exhausted | orchestrator's accounting against the budget in `PROGRESS.md` § Budget — **a human must set it before the run starts**; if it is unset, this stop condition is inert and the run ends only on the others | §2.5 handoff, with the denominator's remaining items ranked by value |
| Oscillation | the same file changed in opposite directions across three consecutive units, or a golden row flipping back and forth | halt (§8.3); write the cycle into `PROGRESS.md` and stop |
| Irreducible blocker | a unit blocked twice by the same cause after a documented workaround attempt | §2.5 handoff for that unit; continue with independent units |
| Unbounded control surface | the edge-physics token count cannot be bounded under a chosen dimension (§5.1 tripwire) | halt (§8.3) — this invalidates a design premise |
| Unexplainable golden diff | a golden changes and the cause cannot be identified | halt (§8.3). Never `--write` past it |

## 2.5 Handoff package

Produced regardless of outcome, at `kickoff/HANDOFF.md`:

- Final state of counters A, B, C
- Everything in `DECISIONS.md`, plus the reasoning for any deferral
- Known gaps: denominator items not covered, and why
- Recommended next steps, ranked
- The exact command sequence to reproduce the current gate state

---

# 5. Solution Direction [immutable]

Ordered by descending binding force. Lower layers yield to higher.

## 5.1 Friction to resist mistakes

### Executable friction — build these, do not merely describe them

The enforcement is the deliverable; this prose is only its documentation. All
land in Unit 0 unless noted.

| mechanism | what it blocks |
|---|---|
| `tsc --noEmit` in `Makefile` + `ci.yml` | the entire class of dangling-import and non-exhaustive-switch breakage a file-splitting refactor produces |
| Golden gate (`npm run verify`) | silent behavior change |
| **Leak gate** (`npm run leak-gate`) | Temporal vocabulary migrating into the library tree. Ratchets down per unit; an increase fails |
| Forbidden-pattern check | `as NodeType` / `as Record<`, bare `Math.random()` under `src/graph/`, and `?? '<temporal-literal>'` silent fallbacks |
| `--write` requires a log entry | regenerating goldens as a reflex |

**The leak ratchet.** The gate counts Temporal-domain literals under the
library-to-be tree (`src/graph/`, `src/components/graph-view/`, and later the
sibling package). **The pattern and the file manifest live in `PLAN.md` §6.5 and
are [immutable]** — the Unit 0g script implements them, it does not get to define
them. Measured at kickoff: **583 occurrences across a 41-file manifest**. Four
files (`edge-types.ts`, `node-types.ts`, `model.ts`, `build.ts`) account for 376,
and all are shim-bound, so Unit 2 carries the largest single drop. The count may
never rise.

**The forbidden-pattern check ships with a committed baseline allowlist**, because
every pattern it matches is present at Unit 0: three `as NodeType` casts
(`ChargeControls.tsx:55,:69,:139`), the `as Record<...>` casts in
`simulation.ts`, and the `?? 'workflow'` / `?? 'workflowDef'` fallbacks in
`nodeDefType.ts`. The allowlist is **append-forbidden**: entries may only be
removed. Without this the check fails red the moment it is wired in and Unit 0
cannot close.

### Named attractors — the failure modes *this* work invites

Watch for these by name; a validator that has not been told them will not find
them.

1. **"Keep `nodeType` as a convenience field for now."** This is exactly how the
   refactor silently never completes. Once a unit declares the field gone, its
   absence is checked.
2. **Widening a tolerance instead of fixing the drift.** Any Tier B epsilon
   change is a blocker unless it is the unit's stated purpose.
3. **Renaming a literal to pass the leak gate.** `'workflow'` → `'kind_a'`
   satisfies the grep and defeats the point. The test is whether a non-Temporal
   consumer could supply that value.
4. **Big-bang units.** Three of the five hardest files must be split *mid-file*.
   The temptation is to do it all at once and lose reviewability entirely.
5. **Redesigning the modal's visual language** rather than recombining its parts.
6. **Fixing a discovered bug silently.** The `Op↔Op` conflation (T14) and the
   theme-invariant canvas (T15) are both real defects. Fixing either is a
   deliberate, logged golden change, not a drive-by.
7. **Abandoning the hard tail.** Units 5a, 5b and 6 (the two axes, computed
   scalars, colour + sizes) carry the most new capability and the most risk.
   Landing 0–4 and declaring victory is the most likely failure mode of this run.
   Counter A cannot reach 42 without them, which is what the denominator is for.
8. **Moving files before they are clean.** Every premature move destroys the
   reviewability of the diff that follows it.

### Tripwires — force a §8.3 halt, not a warning

- **`--write` is attempted in a unit whose `**Goldens:**` line says
  byte-identical.** Stated mechanically on purpose: "the cause cannot be
  explained" is self-graded, and there is always an available explanation. In a
  unit that *does* permit a golden change, `--write` requires a `DECISIONS.md`
  entry written **before** the regeneration, naming the rows expected to move
- The leak count rises, or the Gate 6 violation count rises
- A task appears to require a new dependency (C2)
- A task appears to require a parser or wire-contract change (C1)
- The edge-physics control surface cannot be bounded under a chosen dimension
- A `blocker` finding recurs after being marked resolved

## 5.2 Guiding principles

Ordered, so conflicts between principles resolve without escalation.

1. **The parser is frozen; the shim absorbs every mismatch.** If the wire shape
   is awkward, that is the shim's problem, always.
2. **Behavior preservation beats elegance** until a golden says otherwise. This
   is a generalisation of working software, not a redesign.
3. **One elected dimension per feature.** Never sum, compose, or rank across
   dimensions. Each feature — colour, push/pull, X axis, Y axis, each filter in
   the chain — picks exactly one. This is the settled design (`DECISIONS.md` D1)
   and it is what keeps the model comprehensible.
4. **Make it a compile error if you can, a golden row if you cannot, a loud
   runtime throw if neither.** Silence is the enemy; every trap in
   `NON_INFERABLE.md` is a place where the code currently chooses silence.
5. **Move files only once they are already clean.** Separate the move commit from
   the rewrite commit so `git` sees a rename.
6. **Prefer deleting a special case to parameterizing it.** Several Temporal
   branches are better expressed as ontology data than as library options.

## 5.3 Suggestions

Advisory. Overridable with a logged rationale (§7.4).

- **The cut line is four signatures, not a directory.** `definitionFor` (10 call
  sites), the three force accessors in `forces.ts`, `edgeCategory`, and
  `VisualizerHostProps`. Widening those four is most of the extraction.
- **The registries invert.** The library owns `NodeTypeDefinition`'s *shape*; the
  shim owns the seven entries. That framing resolves most "where does this go"
  questions.
- **`build.ts` is already the shim.** Its own header calls it "a thin
  renderer-translator." It is the natural home for wire-kind → dimension
  projection.
- **`ForceMap2D` and `ForceCurves` already speak an opaque `id: string`** and need
  no change. They are the model for every other control.
- **Prior art in issues:** #51 (inject the taxonomy, schema-driven visibility),
  #49 (unified filter bar), #75 (nexus grouping, Misc tab), #90 (the rename,
  now known to be non-breaking).

---

# 7. State & Session Protocol [immutable spec, living artifacts]

**The invariant: kill any session at any moment and a new one resumes without
loss, from files alone.** Everything below serves that test.

## 7.1 Clean-state discipline

- **Every non-WIP commit** builds, typechecks, and passes Gates 1–5 on its own.
  No half-applied change survives a commit boundary.
- **WIP commits are the one exception, and they are explicitly allowed to be
  red.** Never leave uncommitted work at the end of a session; if a unit is
  incomplete, commit it as WIP and record the exact resumption point in
  `PROGRESS.md` § In-flight work. A WIP commit's message **must** start with
  `WIP(<unit>):` — that prefix is what tells a resuming session the red tree is
  expected rather than broken. A unit is never *complete* on a WIP commit: fold
  it into a green commit before closing the unit (amending or squashing your own
  un-pushed WIP is not a §8.3 history rewrite).
- No `git stash`, ever (C6).
- Commit counts per unit are in `PLAN.md` §6.2. Where a unit both moves and
  rewrites, the move commits come first so `git` records renames.

### Branches and PRs

- Feature branch (the integration target for the whole run):
  **`visualizer/composable-dimensions`**. Every unit PR targets it, not `main`.
- Unit branches: `visualizer/dimensions-unit-<n>` (e.g.
  `visualizer/dimensions-unit-0`, `visualizer/dimensions-unit-5a`).
- Open a real PR per unit with `gh pr create --base visualizer/composable-dimensions`.
  The PR body links `kickoff/reviews/REVIEW_<unit>.md`.
- Commit subjects follow the repo convention: `visualizer: <summary>` (or
  `visualizer+<component>:` when a unit touches the harness or CI).

### Relationship to the repo's own dev-cycle harness

This run does **not** use `/dev-cycle` or `internal/changes/`. The validation
loop in `VERIFICATION.md` §3.2 replaces it for the duration. The one point of
contact is Unit 8's amendment of `internal/harness/components.md` (T27), which
registers the new package so that *future* dev cycles cover it.

## 7.2 Progress artifact

`PROGRESS.md`. Schema is fixed; the agent owns the contents and updates it at
**every** unit boundary, before starting the next unit. See the file itself for
the schema.

## 7.3 Cold-start test

The read order at the top of this document. It is testable: start a fresh session,
follow it, and see whether the session knows what to do without asking. If it
does not, the defect is in `PROGRESS.md` or `PLAN.md`, and fixing it is the next
unit.

## 7.4 Decision log

`DECISIONS.md`. Every non-obvious choice with a one-line rationale, so later
sessions and validators neither relitigate nor silently reverse them. Required
for: any `--write` of goldens, any §5.3 override, any deferral of a denominator
item, and any behavior change visible to a user.

---

# 8. Escalation & Steering Contract [immutable]

**Default is autonomy.** This section enumerates the exceptions. Anything not
listed in §8.2 or §8.3 is §8.1.

## 8.1 Decide unilaterally

No notification beyond the decision log where §7.4 requires one.

- Naming inside the library and the shim
- File and folder organisation beneath the new sibling package
- Commit granularity within a unit
- Which additional fixture to generate, and from which `.twf`
- Ordering of independent units
- Any refactor internal to a file that no gate and no denominator item touches

## 8.2 Flag and proceed

Taken autonomously, logged in `DECISIONS.md`, surfaced in `PROGRESS.md` for
asynchronous review, reversible by design.

- Any golden change, with each changed line explained
- A user-visible behavior change **named in `DECISIONS.md` D3**. Any not named
  there is §8.3, so that D3 actually binds
- Spec edits under `tools/visualizer/spec/` — landed **with** their code, never
  ahead of it (T30)
- The base-node-size diagnosis and fix (R11) — the specific defect is not yet
  characterized; record what you find before changing it
- Fixing T26 / T27 / T28 repository plumbing
- Any §5.3 override

## 8.3 Halt and ask

The closed list. Stop, write the question into `PROGRESS.md` § Open Questions,
and apply §8.4.

- Any §5.1 tripwire
- Any destructive or irreversible action (history rewrite, force push, deleting a
  file you did not create, anything touching a release tag)
- A conflict between two §4 hard constraints
- A contradiction discovered between this document set and the code that changes
  what a unit should do
- Breaking `src/lib.ts`'s public surface — any removal, rename, or signature
  change to a name it exports. `StyleGuide` (C3) is the known instance;
  `mountNodeTypeStyles` (which lives *inside* the manifest and is therefore in
  Unit 6's path), `normalizePayload`, and `VisualizerHostProps` are the ones most
  likely to be hit without noticing
- A user-visible behavior change not named in `DECISIONS.md` D3
- Any change to the parser, the wire contract, or the distribution repo

## 8.4 Silence policy

**Unit 0 exception.** Unit 0 is where the documents first meet the code, so
doc/code contradictions are *expected* there — and the §8.3 halt list contains
exactly that trigger. A contradiction found during Unit 0 does **not** halt the
run: record the question in `PROGRESS.md` § Open Questions, record the assumption
you are proceeding on in `DECISIONS.md`, and continue. Without this, Unit 0's own
findings deadlock the run before any other unit exists to fall back to.

When you halt and no one answers:

1. Commit current work as WIP on the unit's branch. Leave the tree clean (§7.1).
2. Write the question into `PROGRESS.md` § Open Questions with the options you
   considered and which one you would take.
3. **Move to the next unit that does not depend on the answer.** `PLAN.md` §6.2
   marks these **[independent]**. Be honest that they are few: the main
   dependency chain is close to linear, so the realistic fallbacks are Unit 9
   (spec alignment, which depends only on the code it documents), Unit 0's 0c/0d,
   and any unit *after* the blocked one whose blast-radius rows do not overlap
   it. If nothing qualifies, go to step 4 rather than inventing work.
4. If no independent unit remains, produce the §2.5 handoff package and stop.
   Do not guess past a §8.3 item; do not spin.

A halt never blocks the whole run unless the dependency graph genuinely blocks it.

## 8.5 Steering interface

`PROGRESS.md` § Standing Instructions is where a human injects mid-run
corrections without resetting progress. **Re-read it at every unit boundary** —
it may have changed since you last looked. Instructions there outrank §5.2
principles and §5.3 suggestions, and yield to §4 constraints.
