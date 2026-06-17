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
(`selectStrategies` returns `[tree, nexus, worker, namespace, hub]`, or the
`--by` subset) **independently** to produce a candidate split. Candidates that
don't actually divide the chunk (<2 sections) or that would yield a sub-floor
section are dropped. The survivors are then **ranked by whole-compound balance**
(`rankDivisions`) and assigned `Rank` 1..N. Rank 1 is the best.

The cut strategies themselves live in `strategies.go` as `splitBy*` functions
(member → section labeling); `buildSections` turns a labeling into sections + a
dependency DAG. The `hub` strategy peels the single highest-fan-in shared node
into its own section and leaves a `core`; on hub-dominated designs it un-sticks
the structural strategies once the core is recursed (below).

### Recursive re-division (compounding)

A single cut is often not enough: the rank-1 division can still leave one section
over the ceiling. So after building each candidate, `exploreStrategies`
**lazily recurses** — every section that is still over the ceiling, spans ≥2 SCCs
(loops are never cut, at any level), and re-divides cleanly is itself re-divided
(`expandSections` → `subChunk` → the strategy menu again). The recursion is:

- **lazy** — only over-ceiling sections are expanded;
- **greedy inner** — a recursed section keeps a *single* locally-best
  sub-division (`Section.Divisions`), not the whole menu, so the suggestion tree
  stays compact;
- a **portfolio at the top** — every top-level strategy is fully expanded, then
  the whole compounds are ranked against each other;
- **depth-capped** by `--max-depth` (`Options.MaxDepth`, default
  `DefaultMaxDepth`; negative disables recursion). The cap is a safety belt —
  recursion already terminates because every division yields ≥2 strictly-smaller
  sections.

Candidates are ranked by the **worst *leaf* complexity** (the largest unit left
after full recursion), then leaf count, then nesting depth, then total section
count, then strategy name. For a flat (un-recursed) division this reduces to the
original "max-section complexity, then section count, then name" ordering, so the
two-level behavior is a strict generalization of the single-level one.

`Section.Members` and `Section.Complexity` stay authoritative at every level — a
consumer that doesn't walk `Section.Divisions` sees a flat top-level menu exactly
as before.

## Edge semantics

Definition-keyed edges are classified by call semantics:

- **binding** (`activityCall`, `workflowCall`, `asyncBacking`) — call structure;
  drives reachability, SCC condensation, and the partition.
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
| `components.go` | SCC condensation + the decide phase (`partition`) |
| `divisions.go` | the explore phase: orchestration, ranking, section building |
| `strategies.go` | the menu of `splitBy*` cut strategies |
