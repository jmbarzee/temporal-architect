# Explore-stage ranking metric — calibration note (Phase 1)

Resolves the keystone of the compounding-extraction plan: how to rank divisions so
that *dependency extraction* (a small shared service, or a peeled composition
subtree) is preferred when it helps, without rewarding gratuitous cutting.
Calibrated against the `temporal-compranda` benchmark (the relocated toolchain at
`…/temporal-architect`; design at `…/playground/temporal-compranda`).

## Empirical facts (from the compranda binding graph)

- One hard chunk, 99 members, complexity 1053, ceiling 60.
- `workflow:AgenticTask` has binding in-degree **15** and is an **articulation
  point**: removing the service closure splits the remainder into two binding
  components (inner-loop 64, outer-loop 30).
- The service closure is `AgenticTask` + `InitConversation` + `LlmCall` +
  `ExecuteTool` + `FinalizeAgenticResult`. Those activities have in-degree 2, so
  a **dominator** computation (not raw in-degree) is required to recover the
  closure cleanly.
- The wide parallelism is under the orchestrators (`InnerLoop` child-workflow
  fan-out 7, `Harness` 6), i.e. it is realized by **subtree extraction**, not by
  service extraction alone. The two strategies are complementary; parallel width
  must be measured on the produced section DAG of the recursed compound.

## Decision 1 — what makes complexity non-linear (superadditivity)

**Coupling-aware effective complexity**, used by the explore phase's decision
logic only:

```
Ec(S) = N(S) + λ · Ein(S)        λ = 1
```

where `N(S)` is the additive node-complexity sum (today's metric) and `Ein(S)`
is the count of binding edges with both endpoints in `S` (internal coupling).
A tangled unit therefore costs more than the sum of its sub-units (`Ec(parent) >
Σ Ec(child)` by the severed-edge term), which is exactly the "tree > sum of
subtrees" property required for a cut to "drop" complexity.

## Decision 2 — replace vs augment

**Augment (chosen).** The public `complexity` fields on `Node` / `Chunk` /
`Section` stay additive `N` — no wire-contract change, ceiling/floor stay
interpretable, downstream consumers unaffected. `Ec` is used internally for (a)
the recursion's "is this section still worth re-dividing" test and (b) ranking.
This honors the user's lean toward making complexity non-linear *where decisions
are made* without destabilizing the reported scalar. Full replacement (Ec drives
the public scalar + ceiling/floor defaults) remains a clean future option.

## Decision 3 — the ranking key (replaces worst-leaf-only)

`rankDivisions` orders candidates (and the greedy inner pick) by this
deterministic lexicographic key, evaluated on the fully-recursed compound:

1. **fewer leaves still over the ceiling** (ascending) — did the compound
   actually tame the chunk. A balance cut that leaves a 384 core loses to one
   that gets everything under the ceiling.
2. **greater parallel width** (descending) — the max antichain of the
   division's section DAG (how many sections are mutually independent, i.e.
   authorable in parallel). This is the decoupling reward that credits service
   and subtree extraction; the balance metric is blind to it.
3. **lower worst-leaf `Ec`** (ascending) — balance, coupling-aware.
4. **fewer total sections** (ascending) — per-unit cost; the anti-shatter brake.
5. **shallower depth**, then **strategy name** (ascending) — determinism.

The three "more cuts ≠ better" brakes: the existing **lazy ceiling stop** (only
over-ceiling sections recurse), the **per-unit cost** (key 4), and **saturation**
— once key 1 hits 0 and parallel width is bounded by the structure, extra cuts
only add sections (key 4) and lose. All keys are integers or names → byte-stable.

Parallel width = max antichain of the section DAG, via Dilworth (n − maximum
matching of the strict-reachability bipartite relation); section counts are small
(tens), so an O(n^3) matching is ample and deterministic.

## Consequences for the build

- New `service` strategy = hub (max binding in-degree ≥ 2) + its **dominated
  closure**; it also splits the remainder into its binding components so the
  parallel width is visible at the cut. Generalizes and **replaces** the
  single-node `hub` strategy.
- New `subtree` strategy = selective: peel the heaviest **dominated
  child-workflow** subtrees (workflow-call seams only; activities stay glued to
  their caller) until the trunk's `Ec` is under the ceiling.
- Needs a dominator-tree computation over the binding graph and the
  edge-kind-aware work graph (Phase 2).
