# decompose

Computes how a `.twf` design breaks into independently-implementable **chunks of
work** — the analysis behind `twf graph chunks`. The sole consumer is the
temporal-architect harness skill, which uses the decomposition to fan
implementation out to author subagents at contract boundaries.

**The tool informs; it does not impose.** Every recommendation (chunk
boundaries, floor merges, division suggestions) is advisory — nothing is
auto-applied.

`decompose` is a pure *consumer* of `parser/graph` + `parser/ast`, exactly like
the validator / LSP / codegen consumers. It makes no changes to the parser
pipeline (lexer → parser → resolver → validator → graph).

## The two outputs: decide vs explore

The package answers two different questions, and the code is organized around the
distinction:

| | **Decide** (hard boundaries) | **Explore** (soft divisions) |
|---|---|---|
| Question | "What are the separate units of work?" | "This unit is too big — where *could* it be cut?" |
| Nature | Discovered facts — one deterministic answer | Discovered options — a ranked menu |
| Produced by | `partition` (`components.go`) | `exploreDivisions` (`divisions.go`) |
| Harness contract | **MUST** dispatch separate subagents | **MAY** use a suggestion |
| Trigger | always | only for chunks over the `--ceiling` |
| Output | a partition (every definition in exactly one chunk) + an inter-chunk contract DAG | ranked candidate cuts + a per-division dependency DAG |

> The design-of-record (`internal/changes/temp-change-set/chunks/BACKLOG.md`)
> calls these `#1` and `#2`; in the code they are the **decide** and **explore**
> phases.

## High-level flow

`Decompose` (in `decompose.go`) runs a linear pipeline; each stage feeds the
next:

```
buildWorkGraph(g)        workgraph.go   collapse deployment-duplicates into a definition-keyed
                                        graph; classify edges binding / soft / contract
   │
wg.computeComplexity(f)  complexity.go  score each node from AST bodies (base score if no AST)
   │
wg.condense()            components.go  Tarjan SCC over binding edges (collapse workflow-call cycles)
   │
wg.heuristicRoots(f)     roots.go       seed entry points
   │
wg.partition(roots)      components.go  DECIDE: weakly-connected components of binding+soft = the
                                        mandatory chunks, plus the inter-chunk contract DAG
   │
applyFloor(res, floor)   complexity.go  flag too-small chunks; recommend a merge target
   │
exploreDivisions(...)    divisions.go   EXPLORE: for each over-ceiling, non-loop chunk, try the cut
                                        strategies and rank the candidates
```

The AST is optional. When supplied it drives the complexity metric (body counts)
and contributes handler-bearing roots; with a nil AST (e.g. a graph
reconstructed from sampled history) the decomposition is purely structural and
every node carries the base complexity.

### How the explore phase orders strategies

Strategies are **not** applied in priority order with first-match-wins. For each
over-ceiling chunk, `exploreStrategies` runs *every* requested strategy
(`selectStrategies` returns `[tree, nexus, worker, namespace, service, subtree]`,
or the `--by` subset) **independently** to produce a candidate split. Candidates
that don't actually divide the chunk (<2 sections) or that would yield a
sub-floor section are dropped. The survivors are then **ranked by whole-compound
balance** (`rankDivisions`) and assigned `Rank` 1..N. Rank 1 is the best.

The cut strategies live in `strategies.go` as `splitBy*` functions (member →
section labeling); `buildSections` turns a labeling into sections + a dependency
DAG. There are two lenses:

- **Use-case / balance lens** — `tree` (reachable-subtree seams), `nexus`
  (contract closures), `worker` / `namespace` (deployment grouping). Good for
  discovering use-cases from a reverse-history graph.
- **Authorship-parallelism lens** (`dominators.go`) — `service` and `subtree`,
  built for *extracting dependencies so authorship can be parallelized*:
  - **`service`** extracts a shared service — the highest-fan-in hub *plus its
    dominated closure* (the private nodes reachable only through it, recovered
    via dominators, not raw in-degree) — then splits the remainder into its
    binding components. When the hub is an articulation point joining
    otherwise-separable subsystems, this exposes them as independent units.
  - **`subtree`** selectively peels the heaviest *dominated child-workflow*
    subtrees (workflow-call seams only, so activities stay glued to their caller)
    until the trunk fits under the ceiling, leaving light branches inline.

  Thin-neck composition subtrees and thick-neck shared services need opposite
  edge-count signals, so no single balance metric handles both — hence two
  strategies plus a parallel-width term (below) that credits extraction even when
  the extracted piece itself isn't "balanced".

### Effective complexity (coupling-aware)

The explore phase's decisions use a coupling-aware **effective complexity**
`Ec(S) = N(S) + λ·Ein(S)` (λ=1), where `N` is the additive node-complexity sum
and `Ein` is the count of binding edges internal to `S` (`workgraph.go`
`internalBindingEdges`). A tangled unit costs more than the sum of its parts (the
severed edges drop out of the children), which is the "tree > sum of subtrees"
property that lets a cut reduce effective complexity. `Ec` is used **only** for
the recursion's over-ceiling test and for ranking; the public
`Section`/`Chunk.Complexity` stays the additive `N`, so the wire contract and the
ceiling/floor thresholds stay interpretable.

### Recursive re-division (compounding)

A single cut is often not enough: the rank-1 division can still leave one section
over the ceiling. So after building each candidate, `exploreStrategies`
**lazily recurses** — every section that is still over the ceiling (by `Ec`),
spans ≥2 SCCs (loops are never cut, at any level), and re-divides cleanly is
itself re-divided (`expandSections` → `subChunk` → `bestDivision` → the strategy
menu again). The recursion is:

- **lazy** — only over-ceiling sections are expanded;
- **look-ahead** — a recursed section keeps a *single* sub-division, but it is
  chosen by `bestDivision` which fully expands *every* candidate before ranking,
  so the choice reflects each candidate's whole-recursed-compound balance (a
  myopic flat choice would prefer "one big component" over "several medium
  sections" and recurse far worse);
- a **portfolio at the top** — every top-level strategy is fully expanded, then
  the whole compounds are ranked against each other;
- **depth-capped** by `--max-depth` (`Options.MaxDepth`, default
  `DefaultMaxDepth`; negative disables recursion). The cap is a safety belt —
  recursion already terminates because every division yields ≥2 strictly-smaller
  sections.

### Ranking key

`rankDivisions` orders whole compounds by a deterministic lexicographic key
(see `METRIC_CALIBRATION.md` for the calibration against `temporal-compranda`):

1. **fewer cuttable leaves still over the ceiling** — did the compound tame what
   it could (a loop / single-node leaf is uncuttable and never counts as a
   failure, see `leavesOverCeiling`);
2. **lower worst-leaf `Ec`** — coupling-aware balance;
3. **fewer top-level sections** — coherence / anti-shatter (the harness reads the
   top level first, so a few coherent units beat a spray of fragments);
4. **greater parallel width** — the decoupling reward: the maximum antichain of
   the leaf dependency poset (`parallel.go`, Dilworth: leaves − maximum matching
   of strict reachability), i.e. how many units are authorable in parallel;
5. **fewer total sections**, then **shallower depth**;
6. **strategy priority** (call-structure strategies before deployment ones), then
   **name**, for determinism.

`Section.Members` and `Section.Complexity` stay authoritative at every level — a
consumer that doesn't walk `Section.Divisions` sees a flat top-level menu exactly
as before.

### Contract-promotion advisory

The decide phase also emits an informational `suggestContract` **advisory**
(`Chunk.Advisories`, `components.go` `contractAdvisories`) when a chunk contains a
heavily-shared workflow / nexus-operation hub (binding in-degree ≥ 3) that is an
articulation point — removing its dominated closure splits the remainder into ≥2
binding components. It suggests promoting the in-process shared service to a Nexus
contract for an independently-deployable boundary. Like every output here it
**informs; it is never auto-applied**.

## Edge semantics

Definition-keyed edges are classified by call semantics:

- **binding** (`activityCall`, `workflowCall`, `asyncBacking`) — call structure;
  drives reachability, SCC condensation, and the partition. The `workflowCall`
  subset is retained separately (`childWf`) as the only seam the `subtree`
  strategy peels along, so activities stay glued to their caller.
- **soft** (`signalSend`) — keeps two workflows in the same blob (same chunk) but
  they stay *separate* roots; never treated as a binding call edge.
- **contract** (`nexusCall`) — the cleanest contract cut (cross-namespace/worker
  by construction); excluded from the partition and instead forms the
  inter-chunk dependency DAG.

`nexusRoute` and `containment` are not call structure and are ignored. An
`asyncBacking` *target* is treated as a root (an external entry) despite carrying
an in-edge.

## Loops

Workflow-call cycles are condensed with Tarjan's SCC algorithm into a single
node, so a chunk that is one cycle condenses to one node with no internal seam to
cut. **Loops are never cut this pass** — a chunk spanning fewer than two SCCs is
exempt from the explore phase regardless of score. (The raised loop ceiling above
which subtrees may be extracted is deferred; see the chunks BACKLOG.)

## Collapsing deployment-duplicates

The graph duplicates by deployment: one workflow registered on two workers is two
graph nodes, but one thing to author. `decompose` keys both its node set and its
structure on the **definition key** (the leftmost `kind:Name` segment of a node
ID, exposed as `graph.Node.Definition`), which collapses deployment-duplicates
back to one authorable unit with no separate "projection" construct. Per-node
deployment facts (hosting workers / namespaces / langs) are retained as
attributes for the deferred language-boundary split and grouping lens.

## File map

| File | Responsibility |
|---|---|
| `decompose.go` | front door: `Options` + the `Decompose` pipeline |
| `result.go` | the public output model (the wire contract) |
| `workgraph.go` | internal definition-keyed graph, its construction, ID/set helpers |
| `complexity.go` | the complexity metric and the floor |
| `roots.go` | heuristic root seeding |
| `components.go` | SCC condensation + the decide phase (`partition`) + contract advisories |
| `dominators.go` | binding-graph dominators + dominated closures (service / subtree) |
| `divisions.go` | the explore phase: orchestration, recursion, ranking, section building |
| `parallel.go` | parallel width (max antichain via Dilworth) for the ranking key |
| `strategies.go` | the menu of `splitBy*` cut strategies |
