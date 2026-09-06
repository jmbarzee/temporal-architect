# Plan & Decomposition

**§6 of the kickoff set. [living] — the agent owns this file and revises it under
§6.3. Human-approved at kickoff.**

---

## 6.1 The unit test for units

A unit is **independently completable** and **independently verifiable**. Every
unit boundary is a checkpoint: durable, consistent, resumable.

A unit qualifies only if, at its final commit:

1. `tsc --noEmit` passes
2. `npm run build:lib` passes
3. `npm run verify` passes — byte-identical, or the unit's `**Goldens:**` line
   permits the change and the commit body explains every changed line
4. `npm run leak-gate` is at or below the unit's ceiling (§6.5)
5. `npm run boundary-gate` passes (Gate 6)
6. the browser pass renders, per `VERIFICATION.md` Gate 5's six criteria
7. `kickoff/reviews/REVIEW_<unit>.md` exists and every `blocker` and `major` in
   it is resolved, each with the commit sha that resolved it
8. the tree is clean and mergeable (§7.1)

Gates 1–5 also apply at **every intermediate commit**; 6 and 7 are per unit.

**A unit that cannot be verified alone is two units, or it is mis-cut.** If you
cannot write the check, re-cut before writing the code.

---

## 6.2 Units, in order

Commit lists are the starting decomposition, not a contract — re-cutting is §8.1,
recorded under §6.3. **[independent]** marks units reachable when an earlier unit
is halted; they are the §8.4 fallback targets.

### Unit 0 — Verification net **[PR]** · blocks everything

| commit | content |
|---|---|
| 0a | `tsc --noEmit` into `Makefile` + `ci.yml`; fix `tsconfig.node.json` (T26) |
| 0b | Lift `computeVisibleGraph` out of the hook; lift `edgeStyleFor` out of `GraphCanvas`; export `bandCenters` from `forces.ts`. Pure moves |
| 0c | Injected RNG at all nine `Math.random()` sites; production default stays `Math.random` (D11) |
| 0d | Generate + commit the four fixtures via the composite recipe |
| 0e | `vite.verify.config.ts` + `src/verify/main.ts` + `verify/run.mjs`: Tiers A, B, C |
| 0f | Commit the goldens. **The baseline the whole run is measured against** |
| 0g | Leak gate, boundary gate, forbidden-pattern check — all three wired into `Makefile` + `ci.yml` |

0c and 0d are **[independent]** of 0a/0b and of each other.

**Covers:** the means for R41 (which closes in Unit 8, not here).
**Blast radius:** none migrated — this unit makes them observable.
**Leak ceiling:** 583 (baseline).
**Goldens:** created, not compared.
**Done when:** all six gates run green from a clean checkout, **and** you have
deliberately swapped two rules in `edgeTypeFor`, watched Tier C go red, and
reverted.

### Unit 1 — Inject the taxonomy **[PR]** · depends on 0

Stop importing the registries as module singletons. **Twelve files import
`graph/node-types.ts` or `graph/edge-types.ts` directly**; a further eight reach
the same data through `theme/temporal-theme.tsx` and are Unit 2's problem. Widen
the four seams: `definitionFor` → `resolveNodeStyle(node)`; the three `forces.ts`
accessors to `(params, node)`; `edgeCategory`; add a `renderCore` slot to
`VisualizerHostProps`.

Issue #51's "inject the node/edge taxonomy" item, and the seam everything
downstream rides on.

| commit | content |
|---|---|
| 1a | Ontology container type + provider; registries supplied through it |
| 1b | `definitionFor` → `resolveNodeStyle`, all 10 call sites |
| 1c | The three `forces.ts` accessors + `edgeCategory` widened |
| 1d | `VisualizerHostProps.renderCore` |

**Covers:** R1 (partially).
**Blast radius:** B3, B4, B5, B33.
**Leak ceiling:** 583.
**Goldens:** byte-identical. This unit changes no behavior at all.

### Unit 2 — Dimension primitive + shim folder **[PR]** · depends on 1

Create `src/adapter/` and move the Temporal content in: `NODE_TYPE_REGISTRY`,
`edge-types.ts` entire, `build.ts`, `nodeDefType.ts`, `temporal-theme.tsx`, and
`model.ts`'s Temporal residue. Introduce `Dimension`, `DimensionValue` (**stable
interned string keys** — T1), `DimensionalMapping` (enforced non-intersecting
result sets — R12), and `Ontology`.

`GraphNode` gains its dimension map, populated by the shim with `temporalType`
and `sourceFile`. `nodeType` becomes a derived read and is **deleted by the end
of this unit** (§5.1 attractor 1).

| commit | content |
|---|---|
| 2a | **Pure move**: `edge-types.ts`, `build.ts`, `nodeDefType.ts`, `temporal-theme.tsx` → `src/adapter/`. Renames only |
| 2b | **Pure move**: registry entries out of `node-types.ts`; the node-scale block stays |
| 2c | `Dimension` / `DimensionValue` / interning / `DimensionalMapping` / `Ontology` primitives |
| 2d | Shim populates the dimension map; `nodeType` becomes derived |
| 2e | Migrate all 63 `.nodeType` reads; **delete the field** |

**Covers:** R1, R2, R3, R12, R37.
**Blast radius:** B1, B2, B8, B9, B14, B18, B31, B32, B36.
**Leak ceiling:** 150.
**Goldens:** byte-identical.

### Unit 3 — N-dimensional filters + chain UI **[PR]** · depends on 2

`FilterState` → `Record<DimensionId, Set<string>>`. Per-dimension descriptors
carry `emptyMeans`, absent-value policy (T7), focus policy (T8), and reheat policy
(T9) **as data, never as a shared loop** — and the file branch's `setRunning(true)`
is part of that data. `FilterBar` becomes generic dimension chips plus the chain
UI. Search stays last and unchanged. `storage.ts` gains a version and discards on
mismatch (D4). Preserve per-dimension `Set` identity (T5).

| commit | content |
|---|---|
| 3a | `FilterState`/`PinState` generalized; descriptors carrying all four policies |
| 3b | `reconcile.ts` + `useSimulationLoop.ts` read policies from descriptors |
| 3c | `storage.ts` versioned, discard-on-mismatch |
| 3d | `FilterBar` → generic dimension chips |
| 3e | The chain UI: insert before/after, delete, `+` empty state, configurable defaults |

**Covers:** R6, R14, R17, R18, R19, R20.
**Blast radius:** B15, B19, B20, B21, B34.
**Leak ceiling:** 138.
**Goldens:** the filter-matrix and visible-subgraph sections change *shape*
(keys become dimension-scoped). The **resolved visible sets must be identical**
for equivalent filter states — that equivalence is the acceptance test. Tier C
byte-identical. The filter-set-identity rows are new.

### Unit 4 — Push/pull on a chosen dimension **[PR]** · depends on 3

Merge Push and Pull into one view with a shared dimension dropdown and
Band/Topological-styled subsections without enable switches. Charge and core
radius key off the chosen dimension's mapped values — open key space, defaulting
accessors (T3), and the three `as NodeType` casts **deleted**, not widened. Edge
types derive from `(mappedSource, mappedTarget)` plus the edge's own `relation`
and `dispatch` dimensions (R5, required by T14). The shim keeps declaring the
spring table for `temporalType`, preserving today's tuning exactly (**D2**);
other dimensions use the rule-based fallback. Hoist resolution out of the O(n²)
loops (T25).

**The bounded-token rule:** a dimension is usable for push/pull only through a
dimensional mapping whose image is small enough that one token per mapped pair
remains a usable control surface. **Ceiling: 24 tokens.** Exceeding it is the
§5.1 "unbounded control surface" tripwire.

| commit | content |
|---|---|
| 4a | Edge `relation`/`dispatch` dimensions; shim populates them |
| 4b | Charge/coreRadius keyed by mapped dimension value; casts deleted; defaulting accessors |
| 4c | Rule-based spring resolution with the shim table as the `temporalType` override |
| 4d | Resolution memoized outside the charge and link loops |
| 4e | Push + Pull merged into one view with the shared dropdown |

**Covers:** R4, R5, R13, R22, R23, R24, R25, **R34** (the Misc section survives the Push/Pull merge — Gate 5 criterion 3 proves it).
**Blast radius:** B6, B7, B12, B13, B22 (part), B26, B28.
**Leak ceiling:** 102.
**Goldens:** **Tier C byte-identical for the `temporalType` dimension** — that is
the entire point of the shim keeping the table, and the acceptance test for D2.
Tier A `edgeStyleFor` rows unchanged (that unification is Unit 6). Tier B
unchanged.

### Unit 5a — Two symmetric dimensional axes **[PR]** · depends on 4 · **hard tail**

Promote X to a per-value band map so both axes are symmetric (T22). Each axis
picks a dimensional mapping. The Y-axis enable switch becomes the radial-mode
entry (R27). Rewrite `GravityBandPlot` as an axis plot rendering columns (R30).
Parameterize the canvas overlay in lockstep and **pick one semantics** for the
present-vs-all divergence (T12) — record which in `DECISIONS.md`. Give seeding a
defined absent-dimension fallback (T2). Rename `gravityDownstream` — free, since
`ForceParams` is private (C3, closes #90).

**Covers:** R7, R26, R27, R28 (partially), R29 (partially), R30, R32, R33.
**Blast radius:** B10, B11, B24, B27.
**Leak ceiling:** 90.
**Goldens:** Tier A and Tier C byte-identical. Tier B invariants 1, 2 and 4
unchanged; **invariant 3 (band occupancy) may change** — the X axis gains a band
map where it had a single window, and the T12 semantics choice moves stripes.
Explain both in the commit body.

### Unit 5b — Computed scalar axes **[PR]** · depends on 5a · **hard tail**

The computed-scalar path: the interface (node metadata access + graph traversal),
three built-ins (downstream reach — the existing `computeDownstreamScores` —
degree, containment depth), the continuous-band force, and the gradient display
that replaces the chart (R31).

**Covers:** R8, R9, R28 (completed), R29 (completed), R31.
**Leak ceiling:** 80.
**Goldens:** Tier A and Tier C byte-identical (scalars are opt-in and default
off). New Tier A rows recording each built-in scalar's values per fixture.

### Unit 6 — Colour scheme + node sizes **[PR]** · depends on 5b · **hard tail**

Palette (light and dark) as injected input. The canvas becomes theme-aware — it
never has been (T15) — pre-approved under D3. Normalize colour input **before**
`withAlpha`, which currently throws inside the rAF loop on anything but
`#RRGGBB` (T6). Per-value CSS moves to inline custom properties. Add the
graph-pane colour-scheme button (R21). Unify `edgeStyleFor` with the edge-type
resolution, killing the second classifier (T11). **Base node sizes ride the same
scheme input as colour** (R11, D14) — one injected object carries the palette and
the per-value radius and icon size, so a consumer swapping schemes gets both.

**Covers:** R10, R11, R15, R16, R21.
**Blast radius:** B22 (completed), B23, B25, B29, B30.
**Leak ceiling:** 58.
**Goldens:** Tier A `edgeStyleFor` rows **will change** where the two classifiers
disagreed — that divergence is the thing being fixed, so enumerate every changed
row and name which classifier won. Everything else byte-identical. Colour is not
in the goldens; it is Gate 5's job.

### Unit 7 — Post-filter-scoped controls **[PR]** · depends on 6

Controls offer only values present in the post-filter visible set. Closes #51's
"schema-driven control visibility" and the visual-cruft complaint. Also injects
the last three Temporal behaviors — the nexus splice (B16), the summary dispatch
(B17), and the tooltip/focus switches (B35).

**Covers:** R35.
**Blast radius:** B16, B17, B35.
**Leak ceiling:** 0.
**Goldens:** Tier A summary and graduated-edge rows must stay byte-identical —
the behavior moves from hardcoded to injected, and identical output is the proof
the injection is faithful.

### Unit 8 — The move + packaging **[PR]** · depends on 7

The library-to-be tree is clean by construction, so this is close to a pure
directory move: the §6.5 manifest *is* the move list. Create the sibling package,
wire `file:../<name>` (precedent: `wire-types`), add `Makefile` pack/build/clean
targets and the `ci.yml` step, and amend `internal/harness/components.md` with the
new component row, routing, propagation edge, and wave position (T27). Fix T28
while here.

**Covers:** R36, R38, R39, R40, **R41** (every golden green and Gate 5 passing on
every fixture at the final unit *is* "does everything it did before" — this is
where R41 closes, not Unit 0).

**Note on C2:** the `file:../<name>` link this unit needs is explicitly carved out
of the no-new-dependencies constraint (`NON_INFERABLE.md` C2 carve-out 1). Do not
halt on it.
**Leak ceiling:** 0.
**Goldens:** byte-identical. A move that changes a golden is not a move.

### Unit 9 — Spec alignment **[PR]** · **[independent]** — depends only on the code it documents

Align `spec/GRAPH_VIEW.md`, `VIEW_FRAMEWORK.md`, `PRODUCT.md` to the dimension
model. Do **not** split the spec (D8). Resolve the `level`/`tier`/`ladder`
contradiction (T29). Spec text lands **with** its code wherever possible (T30);
this unit is the catch-up for what could not.

**Covers:** R42.
**Goldens:** untouched.

---

### Unit 2 — re-cut at the boundary (§6.3)

The commit order below **reverses** §6.2's: the decoupling comes first and the
file moves come last.

§6.2 opens Unit 2 with two pure-move commits, and they cannot be first. Gate 6
forbids a manifest file from importing `src/adapter/`, and the four files 2a
moves are still imported *from inside the manifest* — `build.ts` by
`useSimulation` and `useGraphModel`, `nodeDefType.ts` by `GraphView`,
`edge-types.ts` by `SpringControls`, `forces.ts`, `simulation.ts` and
`node-types.ts`. Measured: moving them first takes Gate 6 from 11 violations to
roughly 16, so the first commit of the unit would be red and could not close.

§5.2.5 is the governing principle — *move files only once they are already
clean* — and it points the same way. The revised order:

| commit | content |
|---|---|
| 2a | Dimension primitives: `DimensionId`/`DimensionValue`, descriptors, interning, `DimensionalMapping` with the non-intersection throw (R12) |
| 2b | `GraphNode` carries a dimension map; the shim populates it; `nodeType` becomes a derived read |
| 2c | Migrate all 61 `.nodeType` reads and the denormalized edge endpoints; **delete the field** |
| 2d | Registries invert: the library keeps the shapes, the entries become shim data; `DEFAULT_PARAMS` becomes a function of the taxonomy (B9) |
| 2e | **Pure move** — the now-Temporal-only files into `src/adapter/`, once nothing in the manifest imports them |

Coverage is unchanged (R1, R2, R3, R12, R37; B1, B2, B8, B9, B14, B18, B31, B32,
B36) and §6.1 still holds at each commit. `git` still records renames, because
the move is still its own commit — it is now the last one rather than the first.

---

## 6.3 Revision rules

Re-planning is permitted and **logged, never silent**.

- Discovery may **grow** the denominator (§2.1). Add the requirement, note the
  unit that absorbs it, log it in `DECISIONS.md`.
- Only a **human** may shrink the denominator. §8.3.
- Re-cutting a unit is §8.1 provided coverage is preserved and §6.1 still passes
  for each new unit. Record the re-cut here.
- Reordering is §8.1 provided dependencies hold.
- If a leak ceiling proves unreachable, that is a §8.2 flag with the new ceiling
  and the reason — never a silent ratchet reset.

---

## 6.4 Blast-radius register (Counter B)

**38 rows.** Set `status` to `migrated` when the owning unit's gates pass. Deferring one
requires a `DECISIONS.md` entry.

| id | site | unit | status |
|---|---|---|---|
| B1 | `model.ts:19-26` `NodeType` union, `:42` `GraphNode.nodeType` | 2 | |
| B2 | `node-types.ts:112` `NODE_TYPE_REGISTRY` | 2 | |
| B3 | `node-types.ts:322-324` `definitionFor` — 10 call sites | 1 | migrated |
| B4 | `forces.ts:23-25,32-34,41-44` the three accessors | 1 | migrated |
| B5 | `forces.ts:41-44` `bandForType` missing guard (T3) | 1 | migrated |
| B6 | `forces.ts:195-208`, `:260-276` `Set`/`Map` identity (T1) | 4 | |
| B7 | `forces.ts:112-118` O(n²) inner loop, 4 lookups per pair (T25) | 4 | |
| B8 | `simulation.ts:54,:60,:116` keyed records | 2 | |
| B9 | `simulation.ts:154-218` `DEFAULT_PARAMS` module-load const | 2 | |
| B10 | `simulation.ts:265-292` + `seedAt` band seeding (T2) | 5a | |
| B11 | `simulation.ts:113-116` vs `:87-88` axis asymmetry (T22) | 5a | |
| B12 | `edge-types.ts:108-140` `edgeTypeFor` | 4 | |
| B13 | `edge-types.ts:21-26` `EdgeTypeId` + `simulation.ts:71-72` | 4 | |
| B14 | `model.ts:91-92` + `useVisibleGraph:257,277-278` denormalized endpoint types | 2 | |
| B15 | `useVisibleGraph.ts:231-232` the visibility predicate | 3 | |
| B16 | `useVisibleGraph.ts:44-70` `resolveDepEndpoint` nexus splice | 7 | |
| B17 | `useVisibleGraph.ts:150-206` `computeGraphNodeSummary` | 7 | |
| B18 | `nodeDefType.ts:8-22` bijection + silent fallbacks (T19) | 2 | |
| B19 | `filter/types.ts:15-25` `FilterState` / `PinState` | 3 | |
| B20 | `filter/reconcile.ts:44-49,:75-87` asymmetric focus policies (T8) | 3 | |
| B21 | `filter/storage.ts:11-29` unversioned persisted schema | 3 | |
| B22 | `GraphCanvas.tsx:164-207` `edgeStyleFor` (T11) | 4 → 6 | |
| B23 | `GraphCanvas.tsx:932-967` node body: one fill/border/glyph/radius | 6 | |
| B24 | `GraphCanvas.tsx:830-909` gravity overlay, duplicated band maths (T12) | 5a | |
| B25 | `GraphCanvas.tsx:661-718`, `:244-245`, `:267-268` push rings + preview props | 6 | |
| B26 | `ChargeControls.tsx:55`, `:69`, `:139` — three unchecked `as NodeType` casts | 4 | |
| B27 | `GravityControls.tsx:23-24,58,63-64,66-208` bespoke band plot (T23) | 5a | |
| B28 | `SpringControls.tsx:44-51,75-84,88-93` one token per edge type | 4 | |
| B29 | `node-type-styles.ts:27-51` + `GraphControlPanel.tsx:364` per-value CSS | 6 | |
| B30 | `FilterBar.css:393-448` — **eight** chip tints (seven per-type plus the `header-type-nexus` group chip) with eight `.vscode-dark` overrides | 6 | |
| B31 | `build.ts:88-104` `KIND_TO_NODE_TYPE` → dimension projection | 2 | |
| B32 | `build.ts:78-82` `splitDefinitionKey` + `model.ts:58-61` (T20) | 2 | |
| B33 | `GraphControlPanel.tsx:59-61` `NumericForceKey` mapped type (T10) | 1 | migrated |
| B34 | `useSimulationLoop.ts:122-149` asymmetric reheat policies (T9) | 3 | |
| B35 | `GraphView.tsx:665-679`, `:346-349`, `:543` tooltip switch, focus resolution | 7 | |
| B36 | `temporal-theme.tsx:72-79,110-116` direct property access (T16) | 2 | |
| B37 | `TreeView.tsx:77-78,232-234,274-275` reads `filter.visibleTypes` / `filter.selectedFiles` by field name — the tree view stays Temporal but consumes the shared filter shape | 3 | |
| B38 | `WorkflowCanvas.tsx:114-138` constructs, serializes and deserializes the default `FilterState` | 3 | |

---

## 6.5 The manifest and the leak ratchet (Counter C)

### The pattern — [immutable]

Case-insensitive, matched per occurrence, **excluding any line containing
`https?://`** (so provenance links to `temporal-architect` issues do not count):

```
workflow|activity|activities|worker|namespace|nexus|temporal|twf|signalsend|dispatchkind|taskqueue|task_queue
```

Adding a pattern is §8.2. Removing one is §8.3. The gate script implements this
list; it does not define it.

### The manifest — [immutable] · 41 files

The library-to-be. Also the **move list for Unit 8** and the scope of Gate 6.

```
src/graph/**.ts
src/components/graph-view/**.ts
src/components/GraphCanvas.tsx      src/components/GraphView.tsx
src/components/ForceMap.tsx         src/components/CanvasErrorBoundary.tsx
src/components/PinToggle.tsx        src/components/FilterBar.tsx
src/components/ChargeControls.tsx   src/components/SpringControls.tsx
src/components/GravityControls.tsx  src/components/GraphControlPanel.tsx
src/components/controls/**.tsx      src/filter/**.ts
```

…plus the `.css` beside each of those components (`FilterBar.css`,
`GraphView.css`, `GraphControlPanel.css`, `GravityControls.css`, `ForceMap.css`,
`PinToggle.css`, `controls/controls.css`). CSS is in scope because
`FilterBar.css:393-448` is B30 — eight hand-written Temporal chip tints — and a
manifest that skipped stylesheets would report 0 while they sat there.

Files added to the manifest later (e.g. Unit 0b's lifted `edgeStyleFor` module)
join both gates automatically.

### Baseline — measured at kickoff, total **583** across 41 files

| file | count | drops in |
|---|---:|---|
| `graph/edge-types.ts` | 160 | 2 |
| `graph/node-types.ts` | 88 | 2 |
| `graph/model.ts` | 72 | 2 (most), 4 (residue) |
| `components/GraphCanvas.tsx` | 61 | 4 (part), 5a (part), 6 (rest) |
| `graph/build.ts` | 56 | 2 |
| `components/FilterBar.css` | 39 | 6 |
| `components/GraphView.tsx` | 28 | 7 |
| `graph-view/useVisibleGraph.ts` | 19 | 7 |
| `graph-view/useHighlight.ts` | 10 | 7 |
| `graph/simulation.ts` | 9 | 2, 5a |
| `components/GraphView.css` | 8 | 6 |
| `components/GravityControls.tsx` | 7 | 5a |
| `filter/storage.ts` | 5 | 3 |
| `graph-view/useGraphModel.ts` | 3 | 3 |
| `components/FilterBar.tsx` | 3 | 3 |
| `components/GravityControls.css` | 3 | 5a |
| `components/controls/controls.css` | 3 | 6 |
| `graph-view/nodeDefType.ts` | 2 | 2 |
| `components/GraphControlPanel.css` | 2 | 6 |
| `components/PinToggle.css` | 2 | 6 |
| `graph/node-type-styles.ts` | 1 | 6 |
| `graph/groups.ts` | 1 | 6 |
| `filter/reconcile.ts` | 1 | 3 |

`forces.ts`, `viewport.ts`, `highlight.ts`, `ForceMap.tsx`, `controls/*`,
`PinToggle.tsx`, `CanvasErrorBoundary.tsx`, `GraphControlPanel.tsx`,
`ChargeControls.tsx`, `SpringControls.tsx`, and the remaining `graph-view` hooks
measure **0** today. The force kernels and camera maths are already clean.

### Ceilings

| unit | 0 | 1 | 2 | 3 | 4 | 5a | 5b | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|---|
| ceiling | 583 | 583 | 210 | 195 | 160 | 135 | 135 | 60 | 0 | 0 |

Each step is the previous ceiling minus what the drops-in column assigns to that
unit, plus a little headroom for prose that turns out to be load-bearing. Unit 2
carries the largest drop (377: the four shim-bound files plus most of `model.ts`);
Unit 6 carries the second (76, nearly all of it CSS); Unit 7 closes the remaining
57 in `GraphView.tsx`, `useVisibleGraph.ts` and `useHighlight.ts`.

The gate fails on any **increase**. A missed ceiling is a §8.2 flag with the new
number and the reason — never a silent reset.

**Gate 4 counts vocabulary; Gate 6 counts import edges. Neither alone is
sufficient**, and the pairing is deliberate: renaming `'workflow'` to `'kind_a'`
satisfies Gate 4 and leaves Gate 6 red.

**Corrected at the Unit 2 boundary.** This paragraph used to finish "…while
re-exporting the registry through a neutral barrel satisfies Gate 6 and leaves
Gate 4 red." That was false in both halves, and it was load-bearing — it is the
sentence that says the two gates cover each other. A barrel in any unmeasured
tree (`export { NODE_TYPE_REGISTRY } from '../adapter/node-types'`) let a
manifest file import the registry while **both** gates stayed green: Gate 6 saw
an approved specifier, and Gate 4 cannot see it at all, because the laundered
symbols are named `NODE_TYPE_REGISTRY` and `ALL_NODE_TYPES` and contain no word
in the vocabulary pattern. Gate 4 reads text; the text was already neutral.

Gate 6 now resolves re-exports transitively — following `export … from` but not
plain `import`, since only the first hands a dependency to a consumer — and
reports the route it found (`-> ../types/registry-barrel -> ../adapter/node-types`).
So the real guarantee is: **Gate 6 covers the dependency in both directions;
Gate 4 covers vocabulary that is spelled out.** Vocabulary that is laundered
behind neutral symbol names is Gate 6's job alone.

**Third counter, added with `src/adapter/` (D40).** Unit 2 created the shim tree,
and with it a hole the ceilings could not see: vocabulary that *moves* from the
manifest into the shim leaves the ratchet entirely, so relocation reads exactly
like deletion on the only number anyone quotes. Worse than a tie — it can grow on
the way across while the headline falls. Unit 2 did that: −308 from the manifest,
+330 into the shim, a real increase of 22 behind a reported drop of 308.

`gates.json` therefore carries `totalCeiling` = manifest + shim, ratcheted
**flat** rather than down. The shim is allowed its domain vocabulary — that is
what a shim is for — so this does not forbid relocation. It forbids relocation
that quietly adds, and it stops a move from reading as progress.

---

## 6.6 Retro — what this plan's own structure cannot see

*Feedback aimed at whatever produces the next plan of this kind, not at this
run. Written at the Unit 2 boundary, from a question asked about the model rather
than about the work.*

This plan tracks three counters. Ask what each can detect:

| counter | the question it answers |
|---|---|
| A — 42 requirements | *does it do the thing?* |
| B — 38 blast-radius sites | *did you touch the site?* |
| C — 583 → 0 leaks | *is the domain vocabulary gone?* |

**A model can satisfy all three perfectly and still encode every relationship as
coincidence. None of the counters can see shape.** That is not a flaw in them —
it is their scope. But it means this document is a decomposition of
*capabilities*, and a capability decomposition will never surface "these two
fields must agree, and nothing makes them."

The worked example, found by asking about the model rather than the work:

`ChargeParams` stores **which axis** in `chargeDimension` and **a table over that
axis** in `charge`, as two independent fields. Nothing enforces that they agree.
The Unit 2 review found the exact state this admits — after a taxonomy swap the
axis was the new one and the table was still keyed by the old, every lookup
missed, everything fell through to the absent-value physics, and the layout
collapsed silently. The occurrence was fixed. **The shape still permits the
state**, and Units 4, 5a and 5b each add another instance of it.

Every counter was green throughout. They were green because they were measuring
the right things and this is not one of them.

### The two rules worth carrying forward

**1. Storing a fact twice requires a strong, written reason.** Not "it was
convenient", not "the consumer wanted it flat" — a reason, recorded where the
duplication is. Two representations of one fact create a *disagreement state*:
a configuration the types permit that the domain has no meaning for. Absent an
enforced invariant, that state is not hypothetical, it is scheduled.

Three instances in this codebase at the Unit 2 boundary, all the same disease:

- the axis, in `chargeDimension` and again in the key space of `charge`
- the per-axis empty/absent semantics, declared in `DimensionDescriptor` and
  *separately hand-coded* in `computeVisibleGraph`'s predicate (Unit 3 fixes this
  one — it is the only one the plan names)
- absence itself, represented as a particular set of numbers
  (`ABSENT_VALUE_PHYSICS`) rather than as a distinct outcome, so "no value on
  this axis" participates in the physics instead of abstaining from it

**2. The test for a plan, not just for code.** For each structure the plan
introduces, ask: *can I name a state the types permit that the domain has no
meaning for?* Every such state is a coincidence being relied on instead of a
constraint being expressed. A plan that decomposes only capabilities should carry
at least one counter, gate or review lens that asks this — otherwise the first
time anyone asks it is after the code exists, which is where it was asked here.

### The cheap fix a future plan should build in

Shape invariants are checkable, and on this run an invariant without a check is a
wish. The one above is a golden row: for each force, assert
`keys(table) ⊆ the mapping's bucket ids`, and that the params' recorded
provenance matches the live taxonomy. That converts a shape claim into something
Counter-C-style machinery *can* see — which is the whole trick this run already
uses everywhere else.

---

## 6.7 After Unit 9 — the elegance pass

**Ask this once the phases are done, before calling the run finished.** It is
deliberately not scheduled inside a unit: units are scoped to capabilities, and
this question is about the model.

> We have one worked example of a relationship stored twice. **Where else?** For
> each structure the library owns, can the fact be stored *once* — and does
> storing it once also improve something other than tidiness?

The second half of that question is the bar. A change that only reduces
duplication is a refactor; a change that reduces duplication *and* pays for
itself elsewhere is a better model. The example below meets it, and is the
template for what a candidate should look like.

### Worked candidate — params as sparse overrides, not dense tables

Today `charge` / `coreRadius` / `band` are **dense tables**: a complete copy of
every value's physics, derived once from the taxonomy and owned thereafter. The
copy is why the axis has to be stored beside it, why it goes stale, and why a
provenance token is needed to detect the staleness.

Store instead only what the user actually changed — a sparse map of
`bucket → partial physics` — and resolve as `override ?? taxonomy.physicsFor(bucket)`.

The axis and its value set then live in **exactly one place**: the ontology plus
its mapping. Params carry no key space at all, so there is nothing to go stale
and no provenance token to keep in step.

What it pays for beyond elegance — the part that makes it worth doing:

- **Reset becomes free and granular.** Deleting one override restores one value;
  clearing restores all. Today "reset" means rebuilding the whole table, and
  per-slider reset needs a pristine copy kept alongside to diff against.
- **"Is this value tuned?" becomes answerable.** Presence *is* the answer. Today
  a user setting that coincidentally equals the default is indistinguishable from
  the default — so the UI cannot mark modified controls, and the goldens cannot
  either.
- **Persistence survives taxonomy change.** Unit 3 gives `storage.ts`
  discard-on-version-mismatch (D4), which is blunt because a dense table pins a
  key space. Sparse overrides degrade gracefully: buckets that no longer exist
  simply do not apply.
- **Absence gets a home.** With resolution flowing through the taxonomy, "no
  bucket" is a *distinct outcome* from "a bucket whose value is 0" — which is
  precisely the expressiveness D31 defers to Unit 4 and cannot currently state.
- **The 60 Hz copy shrinks.** A slider drag currently rebuilds an N-entry table
  per frame (T25 is the named trap); an override map copies what was touched.

Costs, honestly: resolution becomes two steps on the hot path (mitigated by Unit
4's planned memoisation, which is already in its commit list), the
`defaultForceParams` golden changes shape, and `ForceParams` stops being a fully
dense POJO — though the scalars stay flat, so T10's key-addressed sliders are
preserved.

`ForceParams` is **not** exported from `src/lib.ts`, so none of this is gated by
C3.
