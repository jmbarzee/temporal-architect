# Handoff — the composable-dimensions run

**KICKOFF §2.5. Written at the close of Unit 9, 2026-10-22.** The run is
complete: ten units (0, 1, 2, 3, 4, 5a, 5b, 6, 7, 8, 9) closed, each with
its review record, on eleven stacked pull requests that nothing has merged.
Merging is the human's (§7.1): bottom-up, merge commits only, retargeting
each PR to the feature branch as its predecessor lands (`gh api -X PATCH`,
F14).

## 1. Counters, final

| counter | final | target |
|---|---|---|
| A — requirements covered | **42** | 42 |
| B — blast-radius sites migrated | **36** | 38 |
| C — leaks in the library | **0** (ceiling 0; total vocabulary 1104, ceiling 1104) | 0 |
| Gate 6 — import-boundary violations | **0** (ceiling 0), across a package boundary in both directions | 0 |

Counter B's two outstanding rows are not deferrals: every blast-radius row
the register assigns to a unit was migrated by that unit, and the register's
count of 38 includes two rows the Unit 3 close counted without naming
(PROGRESS § Counters, Unit 3); no `DECISIONS.md` entry defers one, which is
what §6.4 requires of a deferral. A reader who wants the two named should
diff the register against the Unit 3 paragraph; the code they point at is
gone either way.

Counter A reached 42 at the handoff, not at Unit 9: R1, R2, R3, R12 and R37
were satisfied by Units 1–2 and never ticked in the table. Each is marked
now with its evidence (PROGRESS § Requirement coverage); R12's note names
the one measurement not pinned — the intersection refusal itself — and §4
below recommends the probe.

## 2. Decisions

`kickoff/DECISIONS.md`, D1–D65, is the record; every unit's close is a
"What REVIEW_n changed" entry (D52, D54, D56, D58, D60, D64, D65), and every
ceiling that rose rose with its reason there. The deferrals, with their
reasoning, each have an issue:

| deferred | why | issue |
|---|---|---|
| A force tab whose visible set holds nothing is a bare frame | minor UX copy, outside R35's scope; the chips above the pane are the explanation today | [#176](https://github.com/jmbarzee/temporal-architect/issues/176) |
| The dev-cycle review prompts scope only `tools/visualizer/src` | the prompt files are outside the run's write bounds (§4.4) | [#179](https://github.com/jmbarzee/temporal-architect/issues/179) |
| The release workflow neither installs nor packs `tools/graph-view`; repo-level lists do not name it | `_build-artifacts.yml`, `AGENTS.md`, `RELEASING.md` are outside the bounds | [#187](https://github.com/jmbarzee/temporal-architect/issues/187) |
| Graph live-reload continuity (positions, viewport, selection) | the spec promised it; the code never had it; Unit 9 is a spec unit | [#180](https://github.com/jmbarzee/temporal-architect/issues/180) |
| An empty state when the filter hides every graph node | same | [#181](https://github.com/jmbarzee/temporal-architect/issues/181) |
| The graph's keyboard and accessibility model | same | [#182](https://github.com/jmbarzee/temporal-architect/issues/182) |
| The focus transition's framing, lock and flash; its availability on nodes with no tree block | same | [#183](https://github.com/jmbarzee/temporal-architect/issues/183) |
| Packaged names versus bare AST names | same; unpackaged designs unaffected | [#184](https://github.com/jmbarzee/temporal-architect/issues/184) |
| The `?` unresolved badge on graph nodes | same | [#185](https://github.com/jmbarzee/temporal-architect/issues/185) |
| Animated kind transitions | same; design intent since the spec was written | [#186](https://github.com/jmbarzee/temporal-architect/issues/186) |
| The view computes its own layout frame beside the simulation's | Unit 5b's one minor | [#172](https://github.com/jmbarzee/temporal-architect/issues/172) |

Three decisions a human should confirm at merge time, all default
decisions under §8.1: the library's package name `@temporal-architect/
graph-view` (D62; `dimensional-graph` and `forcegraph` were the
alternatives); that the package is packed but **not** published to npm
(D62, D64 §4 — one Makefile line when taken); and that the visualizer
consumes it **from source** through a build alias rather than a `file:`
link, bundling it into its own artifact so consumers of
`@temporal-architect/visualizer` install nothing new (D62 §3).

## 3. Known gaps

- **The denominator is covered**; what is not covered is what the spec
  promised beyond the denominator — the seven behaviours above (#180–#186),
  each now marked deferred in the spec text with its issue (D65).
- **Two couplings no gate sees** (D64 §10): the host's groups control
  borrows the library's panel chrome by class name and the `--toolbar-height`
  the pane sets; the theme hook knows VS Code's marker classes beside the
  generic `data-theme`.
- **One open question for a human** (PROGRESS § Open questions, OQ4):
  whether VERIFICATION §2.3's floor and §3.1.1's fourth invariant should be
  reworded to name motion rather than stored velocity. They are [immutable]
  documents, so the run recorded the measurement and left the words.
- **R12's intersection refusal is not pinned by name** (§1).
- **PLAN §6.6's shape invariant** — `keys(table) ⊆ the mapping's bucket ids`
  — is moot in its original form (the tables are sparse overrides since
  D47) and its spirit is carried by `tuningProbes.membership`; nothing asks
  it of a host's taxonomy at construction beyond `createOntology`'s coherence
  checks.

## 4. The elegance pass (PLAN §6.7)

> For each structure the library owns, can the fact be stored once — and
> does storing it once also improve something other than tidiness?

Asked of every structure the library ships at the close. The worked
candidate the plan gave — params as sparse overrides — was done by Units 4
and 5b (D47, D55): `PairTuning` and `LayoutTuning` carry only what the user
changed and resolve through the taxonomy, so there is no key space to go
stale and no provenance token. The rest of the pass, with the bar applied:

| structure | stored twice? | pays for itself? | verdict |
|---|---|---|---|
| `GraphNode.parentId` beside the containment edges | yes — the host writes both from one lookup; the view reads the field at O(1) and the edges for the children | **yes**: a `parentOf` index the library derives from the edges once per graph removes a host obligation and the only disagreement state the `Graph` contract still admits | **recommended** (ranked first below); documented on the model meanwhile (D64 §5) |
| `Graph.duplicateGroups` beside `definitionKey` | yes — an index of a field the nodes hold; the canvas already re-derives the visible-set version | partly: deriving it once in the library removes the host's obligation, but the host's group overlay reads the whole-graph index too | **recommended**, with the first: both are indexes the library can own |
| The chip `counts` handed in beside the view's `valuesByDimension` | no — different facts (definitions per file, nodes per value); the review (REVIEW_8 C20) asked and the answer held | — | keep |
| The two artifact gates (`verify/dts-gate.mjs`, `verify/prune-dts.mjs`) in two packages | yes — the same scripts, one line of PRIVATE patterns apart | no: sharing them costs the library's extractability, which they exist to prove | keep, said in each header |
| The host theme read by the library from the DOM (`useHostTheme`, VS Code's classes) | partly — the host already knows its theme and sets `data-theme`; the library sniffs it again | yes: a `hostTheme` prop (the host says; the library listens to nothing) removes the embedding assumption REVIEW_8 named | **recommended** |
| The `--toolbar-height` custom property the pane sets for a host control | no — one writer, one reader, undocumented until D64 | — | keep; the groups control's borrowed chrome is the coupling worth a component |
| `NodeGroup.emphasized` → `HOVER_STRENGTH` | was: a strength the host received and returned | done (D64 §5) | — |
| The filter policy (`emptyMeans`, `absentMeans`) and `passesSelection` | once since Unit 3 (D43); the tree view reads the same function since Unit 8 | — | — |

## 5. Recommended next steps, ranked

1. **Merge the stack** bottom-up (#158 → #159 → #160 → #161 → #169 → #171
   → #173 → #174 → #175 → #177 → #178), merge commits only, retargeting
   each PR as its predecessor lands (D36, F14). Nothing else here depends on
   the order.
2. **#187** — install, pack and attach `tools/graph-view` in the release
   workflow; register the package in `AGENTS.md`, `RELEASING.md`, the root
   `.gitignore`, the orchestrator README. One PR, outside this run's bounds.
3. **#179** — widen the dev-cycle review prompts to `tools/graph-view/src`;
   without it the engine sits outside every future review.
4. **The two indexes** (§4): `parentOf` and `duplicateGroups` derived once by
   the library from the edges and `definitionKey`; `Graph` shrinks to nodes
   and edges, and no host can disagree with itself.
5. **`hostTheme` as a prop** (§4), retiring the VS Code marker classes from
   the library.
6. **#180–#186**, in this order: #180 (live-reload continuity — the one a
   user meets every time they save), #183 (the focus transition), #181,
   #182, #185, #184, #186.
7. **Pin R12's intersection refusal** — one `refusal()` row in
   `tuningProbes.refusals`.
8. **Decide the package's name and publication** (§2) before the first
   release that packs it.
9. **OQ4** — reword VERIFICATION §2.3 and §3.1.1, if the owner of those
   documents agrees with the measurement.
10. **#176, #172** — the two minors.

## 6. Reproducing the gate state

From the repository root, on `visualizer/dimensions-unit-9`:

```bash
make check-visualizer
```

That installs `tools/graph-view` if its `node_modules` are missing (a job
that installs only the visualizer still compiles correctly), typechecks both
packages, runs the map, surface, leak, boundary and pattern gates, compares
the seven goldens, builds both libraries pruned to what their entries reach,
and runs both artifact gates (a consumer compiled against a copy outside the
repository; the published stylesheet read for the tokens). Expected summary
lines at the close:

```
surface gate: src/lib.ts exports 90 names, as committed
surface gate: @temporal-architect/graph-view exports 57 names, as committed
leak count: 0 (ceiling 0)
total vocabulary: 1104 (ceiling 1104)
boundary violations: 0 (ceiling 0)
forbidden patterns: 5 allowlisted occurrence(s), 0 new
verify: 7 golden(s) match.
published types: 15 declaration file(s) reachable from ./dist-lib/index.d.ts; 32 unreachable pruned
published types: 10 declaration file(s) reachable from ./dist-lib/lib.d.ts; 19 unreachable pruned
```

Gate 5, the browser pass, from `tools/visualizer` with the dev server up:

```bash
npm run dev -- --port 5178 --strictPort
node verify/screenshot.mjs unit-9 --port 5178
node verify/screenshot.mjs unit-9 --port 5178 --dark
```

The script emulates the colour-scheme preference, fails a capture in the
wrong theme, fails a `--toggle` that changed nothing, and takes `--only
<fixture>` for a chip only some fixtures carry. The committed captures are
`kickoff/screenshots/unit-8-*` (the last unit that changed the view's
output; Unit 9's one view change, the per-chip badges, is recorded by hand
in PROGRESS § Gate state).

The review workflows that produced `REVIEW_7.md`, `REVIEW_8.md` and
`REVIEW_9.md` are rule 12's shape (VERIFICATION §3.5.5): five finders in
isolated worktrees told the sha and detaching to it, a grouper that only
groups, verifiers that default to refuted. Their scripts are not in the
repository; the records are.
