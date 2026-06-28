# Handoff — Compounding Decomposition / Extraction Strategies

Self-contained context dump so this work can resume in a fresh chat (the previous
chat must be restarted because the Cursor window is still rooted at the dead
`…/temporal-skills` path after the repo split — see §1). Read this first, then the
three companion docs it points to.

## 1. Location & build conventions

- Toolchain repo (what we work in): `/Users/jbarzee/go/src/github.com/jmbarzee/temporal-architect`
  (the repo was split/relocated; the old `…/temporal-skills` root no longer
  exists). **Re-root the Cursor window on `temporal-architect`** (File → Open
  Folder) before resuming, or every read/search prompts for approval and `Glob`
  falls back to the dead root.
- Go modules live under a `go.work`; build/test **from `tools/lsp`** (not the repo
  root), and prefix every Go command with `GOMODCACHE=$HOME/go/pkg/mod` per
  `AGENTS.md`. Example: `cd tools/lsp && GOMODCACHE=$HOME/go/pkg/mod go test ./parser/decompose/...`.
- Docs drift gate: after touching CLI flags, run `make gen-docs` (regenerates
  `tools/lsp/cmd/twf/COMMANDS.md`); `make check-docs` fails until it's regenerated
  AND committed.
- Benchmark design: `/Users/jbarzee/go/src/github.com/jmbarzee/playground/temporal-compranda`
  (separate playground repo; persists across the re-root).

## 2. Artifact map (all under `internal/changes/temp-change-set/chunks/`)

- `BACKLOG.md` — design-of-record for the whole `chunks` workstream.
- `COMPOUNDING_PROPOSAL.md` — the original review/proposal: P1 hub, P2 recursion
  (both LANDED, see §3), P3 dominator, P4 caller-set, + a REVISIONS outline.
- `METRIC_CALIBRATION.md` — Phase 1 decisions for the CURRENT plan (the ranking
  metric + replace-vs-augment). **Authoritative for the metric.**
- `HANDOFF.md` — this file.
- The active plan file is `~/.cursor/plans/compounding-extraction-strategies_25c4c725.plan.md`
  (global, outside the repo; its 6 phases are reproduced in §5 so this doc is
  self-contained).

## 3. What has already LANDED (prior pass — verify with `git status`)

The first compounding pass is implemented in `tools/lsp/parser/decompose` (commit
status unknown — the repo split happened after; confirm with git):

- **`hub` strategy** (`strategies.go` `splitByHub`): extracts the single
  max-binding-in-degree node (≥2) into `hub:<key>`, rest `core`.
- **Lazy recursive re-division** (`divisions.go`): `exploreStrategies` →
  `candidateDivisions` + `expandSections` (lazy, greedy-inner, depth-capped) +
  `subChunk`; over-ceiling, ≥2-SCC, ≥floor sections get one nested best division.
- **Ranking** = worst-leaf complexity → leaf count → depth → total sections →
  name (`rankDivisions`); degenerates to the old max-section ordering when flat.
- **Model/flags**: `Section.Divisions` (recursive), `Options.MaxDepth` +
  `DefaultMaxDepth=4`, `--max-depth` CLI flag, schema `hub` enum + `Section.divisions`
  (`$schemaVersion` 1.2.0). Tests: hub, recursion, max-depth, determinism.

Compranda run with this pass: still leaves a stubborn ~384 `core` leaf (the
`AgenticTask` hub blob) and a 278 outer-loop leaf (correctly loop-exempt). That
result motivated the CURRENT plan.

## 4. Current status — todo-by-todo

**ALL PHASES LANDED** (in `tools/lsp/parser/decompose`, shipped via
[`../../parser/CHANGES_007.md`](../../parser/CHANGES_007.md)):

- `metric-calibration` (Phase 1) — **DONE**: `METRIC_CALIBRATION.md`.
- `edge-kinds` (Phase 2) — **DONE**: `childWf` edge set + `internalBindingEdges`
  (`Ein`) in `workgraph.go`.
- `service-strategy` (Phase 3b) — **DONE**: `splitByService` + `dominators.go`
  (`bindingDominators`/`dominatedClosure`) + `bindingComponents`; replaced `hub`.
- `subtree-strategy` (Phase 3a) — **DONE**: `splitBySubtree` (heaviest dominated
  child-wf peel until trunk `Ec` ≤ ceiling).
- `metric-wire` (Phase 4) — **DONE**: `effectiveComplexity` (`Ec`), parallel
  width (`parallel.go`), rewritten `rankDivisions`, **plus** look-ahead recursion
  (`bestDivision`) — the flat greedy inner pick was myopic and had to be replaced
  for the strategies to converge.
- `advisory` (Phase 5) — **DONE**: `contractAdvisories` (`suggestContract`).
- `surface-tests-docs` (Phase 6) — **DONE**: wire-types regen + residue union,
  `make gen-docs`, decompose tests (service/subtree/advisory/determinism),
  README, `COMPOUNDING_PROPOSAL.md` status header, `CHANGES_007.md`. Compranda
  saved outputs refreshed.

**Acceptance met:** `twf graph chunks --ceiling 60` on compranda ranks the
`service` division #1 — extracts the `AgenticTask` service closure and splits the
inner/outer subsystems, peels orchestrator subtrees in the recursion, and emits
the `AgenticTask` `suggestContract` advisory. Deterministic; full Go suite green.

One calibration refinement beyond §5/§6 (documented in `CHANGES_007.md` /
`README.md`): `leavesOverCeiling` ignores uncuttable (loop / single-SCC) leaves
so the cleanest structural cut isn't penalized for a chunk's irreducible tangle,
and the ranking key order puts the coherence (fewer top-level sections) brake
*above* parallel width — measured on recursed leaves, parallel width otherwise
rewards gratuitous shattering.

Also DONE this chat (outside the toolchain repo): **deduplicated the agent worker**
in compranda — `agentic.twf` now defines one `worker agentWorker` (was
`innerAgentWorker` + `outerAgentWorker`); `comparanda.twf` registers it on both
namespaces (task queues `inner-agent` / `outer-agent`); comments in
`outer_loop.twf` updated. `twf check` passes; graph shows one `agentWorker` def
with two deployments. The saved `chunks-decomposition.txt/.json` in the compranda
dir were regenerated against this deduped design (still the pre-extraction
output).

## 5. The plan (6 phases) — reproduced

1. **Metric calibration** (keystone) — DONE, see `METRIC_CALIBRATION.md`.
2. **Edge-kind-aware work graph**: in `workgraph.go`, keep `binding` (activity+
   workflow+asyncBacking) for reachability/SCC/partition, but ALSO retain a
   separate child-workflow adjacency (`childWf`, the `workflowCall` edges) so cut
   logic can prefer workflow-call seams and keep activities glued to their caller.
   Add an internal-edge counter for `Ein` (coupling).
3. **New strategies** in `strategies.go`:
   - `service` (replaces `hub`): hub (max binding in-degree ≥2) **+ its dominated
     closure** (needs a dominator-tree computation over the binding graph), and
     split the remainder into its binding components so parallel width is visible.
   - `subtree` (selective): greedily peel the heaviest **dominated child-workflow**
     subtrees as dependencies until the trunk's `Ec` is under the ceiling; keep
     activities and light branches inline. Workflow-call seams only.
   - Both reuse `subChunk`/`buildSections`/recursion in `divisions.go`.
4. **Wire the metric** as the ranking objective (`rankDivisions`) and the
   recursion over-ceiling test, per §6 below.
5. **Contract-boundary promotion advisory** (decide phase, `components.go` +
   `result.go`): detect a heavily-shared binding hub that looks like a shared
   service; emit an informational `suggestContract`-style advisory (own chunk via
   a contract). Never auto-applied.
6. **Surface/tests/acceptance**: schema (new strategy enum values, advisory field;
   minor `$schemaVersion` bump), `--by` help + `make gen-docs`, decompose tests
   (activities-stay-glued, selective peel, service closure, advisory, determinism),
   re-run compranda to match ground truth + refresh saved outputs, update
   `README.md` + `COMPOUNDING_PROPOSAL.md`, write a `CHANGES`/`REVISIONS` entry.

## 6. The settled design (the crux — full reasoning in METRIC_CALIBRATION.md)

- **Superadditive "effective complexity"** for explore-phase decisions only:
  `Ec(S) = N(S) + λ·Ein(S)`, λ=1 (`N` = additive node sum, `Ein` = internal
  binding edges). Gives "tree > sum of subtrees" so a cut can "drop" complexity.
- **Augment, not replace**: public `complexity` fields stay additive `N` (no
  wire-contract change, stable ceiling/floor); `Ec` is used only for the recursion
  over-ceiling test and ranking. (Full replace is a documented future option; the
  user leaned replace but it was uncertain.)
- **Ranking key** (deterministic, on the recursed compound): (1) fewer leaves
  still over ceiling, (2) greater **parallel width** = max antichain of the
  section DAG (Dilworth: n − max matching of strict reachability), (3) lower
  worst-leaf `Ec`, (4) fewer total sections, (5) shallower depth, (6) strategy
  name. The three "more cuts ≠ better" brakes: lazy ceiling stop (existing),
  per-unit cost (key 4), saturation (key 1 → 0, parallel width bounded).

### Why two strategies, not one (the core insight from this chat)

The decomposition goal here is **dependency extraction to parallelize authorship**,
which is a *different objective* than the balance metric we shipped. Thin-neck
**composition subtrees** and thick-neck **shared services** need opposite
edge-count signals, so no single min-cut/balance metric handles both — hence (1)
two strategies and (2) a parallel-width term that credits extraction even when the
extracted piece itself isn't "balanced". This lens is for the design-time
authorship-parallelism goal; the existing balance/reachability strategies remain
right for **use-case discovery from reverse-history graphs** — keep both.

## 7. Compranda ground truth (the calibration target)

The known-good decomposition the build must reproduce:
- Extract the `AgenticTask` **service**: `workflow:AgenticTask` + activities
  `InitConversation`, `LlmCall`, `ExecuteTool`, `FinalizeAgenticResult`
  (`AgenticTask` in-degree 15; it is an articulation point joining the inner-loop
  and outer-loop binding components).
- Peel the heavy composition subtrees under the orchestrators (`InnerLoop`
  child-wf fan-out 7, `Harness` 6; e.g. `PaperPrep`/`PaperPrepBatch`).
- Do NOT shatter single activities into their own sections.
- Do NOT cut the outer-loop SCC (loop-exempt).

## 8. Open questions to confirm during build

- Exact metric weights (λ, and whether parallel width needs an explicit weight vs
  pure lexicographic ordering) — start with the §6 lexicographic key, adjust if
  compranda doesn't rank cleanly.
- `service` likely fully replaces `hub` (degenerate hub = empty closure). Confirm
  and drop the `hub` enum value, or keep `hub` as an alias.
- Parallel width: max antichain (chosen) vs a simpler independent-siblings proxy.
- Whether to also let `Ec` drive the public ceiling (i.e. move toward "replace").

## 9. How to resume

1. Re-root the window on `temporal-architect`; reload window.
2. `cd tools/lsp && GOMODCACHE=$HOME/go/pkg/mod go test ./parser/decompose/...`
   to confirm the landed pass is green.
3. `git status` to confirm what (if anything) from the landed pass / the compranda
   dedup / these notes is uncommitted.
4. Resume at Phase 2 (`edge-kinds`); follow §5/§6. Then 3 → 4 → 5 → 6.
5. Acceptance: re-run `twf graph chunks --ceiling 60` on the compranda `*.twf`
   and confirm it now extracts the `AgenticTask` service and peels the orchestrator
   subtrees (§7), then refresh the saved `chunks-decomposition.*`.
