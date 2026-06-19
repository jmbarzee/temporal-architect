# Parser Changes: explore-stage authorship-parallelism lens — `service` + `subtree` strategies, coupling-aware ranking

**Source review(s):** [`internal/changes/temp-change-set/chunks/COMPOUNDING_PROPOSAL.md`](../temp-change-set/chunks/COMPOUNDING_PROPOSAL.md) (P3/P4 ideation) and the settled design in [`internal/changes/temp-change-set/chunks/METRIC_CALIBRATION.md`](../temp-change-set/chunks/METRIC_CALIBRATION.md).
**REVISIONS file(s):** none (promoted directly from the calibration note + handoff).
**Design-of-record:** [`internal/changes/temp-change-set/chunks/BACKLOG.md`](../temp-change-set/chunks/BACKLOG.md).

## Summary

The `decompose` explore stage (`tools/lsp/parser/decompose`) gains a second
decomposition lens aimed at **dependency extraction to parallelize authorship**,
distinct from the existing balance/use-case lens. The single-node `hub` strategy
and the worst-leaf-only ranking from the first compounding pass are **replaced**
by:

- a **`service`** strategy — extract a shared service (the highest-fan-in hub
  *plus its dominated closure*, recovered via a new dominator-tree computation,
  not raw in-degree) and split the remainder into its binding components;
- a **`subtree`** strategy — selectively peel the heaviest *dominated
  child-workflow* subtrees (workflow-call seams only, activities stay glued to
  their caller) until the trunk fits under the ceiling;
- a coupling-aware **effective complexity** `Ec(S) = N(S) + λ·Ein(S)` (λ=1) used
  for the recursion's over-ceiling test and ranking (the public additive `N`
  scalar is unchanged);
- a **parallel-width** ranking term (max antichain of the leaf dependency poset,
  via Dilworth) that rewards genuine decoupling;
- **look-ahead recursion** — each over-ceiling section is replaced by the *best
  fully-recursed* sub-division, not a myopic flat pick;
- a `suggestContract` **advisory** flagging an in-process shared service that is
  an articulation point (a candidate Nexus contract boundary).

Calibrated against the `temporal-compranda` benchmark: `twf graph chunks
--ceiling 60` now ranks the `service` division #1, extracting the `AgenticTask`
service (`AgenticTask` + `InitConversation`/`LlmCall`/`ExecuteTool`/
`FinalizeAgenticResult`) and separating the inner- and outer-loop subsystems,
with the orchestrator subtrees peeled in the recursion — and emits a
`suggestContract` advisory for `AgenticTask` (binding in-degree 15).

## Changes by Type

### API / wire contract (additive, except the `hub` enum removal)

- **`Division.strategy` enum:** `"hub"` is **removed**; `"service"` and
  `"subtree"` are added (`StrategyService`, `StrategySubtree` in `result.go`).
  This is a breaking enum change, acceptable pre-v1 (`hub` shipped in the prior
  pass and had no external consumers — the visualizer/extension read the `graph`
  payload, not divisions).
- **`Chunk.advisories`** (new, `omitempty`): a list of informational `Advisory`
  records. The only kind today is `suggestContract` (`AdvisorySuggestContract`),
  carrying the hub `subject`, its dominated-closure `members`, and a `detail`
  string. Never auto-applied.
- The TypeScript projection (`@temporal-architect/wire-types`) is regenerated
  (`make gen-types`): `decompose.ts` now exports `Advisory` /
  `AdvisorySuggestContract` / `StrategyService` / `StrategySubtree`, and the
  hand-written `DivisionStrategy` union in `residue.ts` drops `"hub"` and adds
  `"service"`/`"subtree"`, plus a new `AdvisoryKind` alias.
- **CLI:** `--by` help and the `chunks` usage string list
  `tree,nexus,worker,namespace,service,subtree`; the text renderer prints
  `advisory [<kind>] <subject>: <detail>` per chunk. `COMMANDS.md` regenerated.

### Internal

- **`workgraph.go`:** retain a `childWf` edge set (the `workflowCall` subset of
  `binding`) so `subtree` peels along workflow-call seams only; add
  `internalBindingEdges` (the `Ein` coupling term) and a `setKeys` helper.
- **`dominators.go`** (new): Cooper–Harvey–Kennedy iterative dominators over the
  binding subgraph from a virtual super-source above the chunk roots
  (`bindingDominators`), plus `dominatedClosure`. The super-source uses a
  non-empty sentinel so a root's immediate dominator is distinguishable from an
  absent entry (the empty-string sentinel collided with Go's zero value and
  silently produced an empty dominator map).
- **`strategies.go`:** `splitByService` (hub + dominated closure +
  `bindingComponents` of the remainder) and `splitBySubtree` (heaviest-first
  dominated child-workflow peel until trunk `Ec` ≤ ceiling) replace `splitByHub`;
  `maxInDegreeHub` and `bindingComponents` helpers; `splitBy` now threads the
  ceiling (the selective `subtree` strategy needs it). `selectStrategies` /
  `rationaleFor` updated.
- **`divisions.go`:** `effectiveComplexity` (`Ec`); `rankDivisions` rewritten to
  the calibrated lexicographic key (cuttable-leaves-over-ceiling → worst-leaf
  `Ec` → fewer top-level sections → parallel width → total sections → depth →
  strategy priority → name), with `strategyPriority` preferring call-structure
  strategies over deployment ones; `leavesOverCeiling` now ignores uncuttable
  (loop / single-SCC) leaves so the cleanest structural cut is not penalized for
  a chunk's irreducible tangle; the recursion over-ceiling test switches to `Ec`;
  and `bestDivision` adds look-ahead (expand every candidate before choosing),
  replacing the former greedy flat pick.
- **`parallel.go`** (new): parallel width = maximum antichain of the leaf
  dependency poset (mutually-reachable leaves collapsed, then Dilworth = elements
  − maximum bipartite matching of strict reachability). Deterministic; leaf
  counts are tens, so the `O(n³)` matching is ample.
- **`components.go`:** `contractAdvisories` detects the suggestContract case
  (heavily-shared workflow/nexus-op hub that is an articulation point); wired into
  the `Decompose` pipeline (`decompose.go`) after the floor pass, independent of
  the ceiling.

### Determinism / complexity

All new computations iterate sorted keys and use integer/name tie-breaks; output
is byte-identical across runs (covered by `TestExploreDeterministic`). The
look-ahead recursion expands every candidate per over-ceiling section rather than
only the winner; it stays tractable in practice (depth-capped by `--max-depth`,
default 4; lazy over-ceiling expansion; `temporal-compranda` ≈ 0.04s).

## Tests

`tools/lsp/parser/decompose/decompose_test.go`:

- `TestServiceStrategyExtractsClosure` — the service section is the hub's
  dominated closure and the two callers land in separate component sections.
- `TestSubtreeStrategyPeelsHeavySubtrees` — heavy child-workflow subtrees are
  peeled (activities glued to their workflow), the light branch stays inline, and
  the root orchestrator stays in the trunk.
- `TestContractAdvisoryForSharedService` — a `suggestContract` advisory fires for
  a heavily-shared articulation hub.
- The recursion-mechanics tests (`TestRecursiveReDivision`,
  `TestMaxDepthDisablesRecursion`) are pinned to `--by tree` so they exercise
  recursion independent of cross-strategy ranking.
- The former `TestHubStrategyIsolatesSharedNode` is replaced by the service test.

`make test` / `go test ./...` green from `tools/lsp` (with
`GOMODCACHE=$HOME/go/pkg/mod` per `AGENTS.md`); wire-types `typecheck` green.

## Downstream propagation

- **`wire-types`** (this change, intra-cycle): regenerated + the residue union
  updated; published as a version bump so the VS Code extension picks up the new
  enum values and the `advisories` field.
- **`visualizer`:** reads the `graph` payload, not the `chunks` decomposition —
  unaffected. It may surface `advisories` / the new strategies later.
- **`skills` (temporal-architect harness/design):** the design/decomposition
  reference should describe reading `Chunk.advisories` and the `service` /
  `subtree` strategies, and that the rank-1 division now reflects shared-service
  extraction. (Propagation review owed — see `propagate-changes`.)

## Open questions (carried)

- **Metric weights:** λ=1 and the pure-lexicographic ranking (no explicit
  parallel-width weight) reproduce the compranda ground truth; revisit if another
  design ranks poorly. See `METRIC_CALIBRATION.md` §8.
- **Replace vs augment:** `Ec` still only drives explore-phase decisions; whether
  to let it drive the public ceiling/floor remains a documented future option.
- **Advisory threshold:** the `contractAdvisoryMinFanIn = 3` + articulation gate
  is a documented heuristic, not calibrated.
