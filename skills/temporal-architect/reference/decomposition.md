# Decomposition + Dispatch Protocol

How to turn a `.twf` design into a dispatch plan for author subagents, using `twf graph chunks`. Read this before breaking out a non-trivial design.

The governing rule: **cut at `.twf` contract boundaries, never finer.** `.twf` *is* the contract. The tool **informs; it does not impose** — every output below is input to your judgment, not a command.

## The command

```
twf graph chunks [--ceiling N] [--floor M] [--by tree|worker|namespace|nexus]
```

- `twf graph chunks` — emits the **#1 hard partition** (every definition in exactly one chunk) + a per-chunk complexity score + floor-merge recommendations.
- `--ceiling N` — additionally emits **#2 soft divisions** (ranked candidate cuts + a dependency DAG) for any chunk scoring over `N`.
- `--floor M` — chunks below `M` are flagged "too granular for their own subagent."
- `--by ...` — biases which soft-division strategy is suggested (reachable-subtree, `nexusCall`-boundary, worker, namespace).

If the subcommand is absent, use the [manual fallback](#manual-fallback).

## #1 Hard boundaries — MUST dispatch separately

Hard boundaries are discovered **facts** about the graph, not suggestions. Dispatch a **separate** author subagent per hard chunk:

- **Isolated components** — disconnected pieces of the call structure are independent work.
- **`nexusCall` cuts** — the cleanest contract boundary (cross-namespace/worker by construction). The Nexus operation signature *is* the contract; pin it.
- **Language boundaries** — once `@lang` lands, a hard split keyed on per-node language. Until then, infer language from project layout / the user.

Each definition belongs to exactly one hard chunk. A node reachable from two roots is reported as **overlap** (listed once, referenced by each root) — implement it once and let both chunks consume it; do not duplicate it across subagents.

## #2 Soft divisions — MAY use

Soft divisions appear only when a chunk exceeds `--ceiling N`. They are **options** over an oversized chunk:

- Treat the **ranked candidate cuts** as suggestions; pick the one that matches a real boundary in the domain, or decline to cut.
- The **inter-section dependency DAG is the build order.** Author independent sections first, then the sections they unblock. This is the PERT walk — not a blind parallel fan-out.
- **Loops are never cut.** An SCC-collapsed chunk (workflow-call cycle) is exempt regardless of score — implement it as one unit.

## Complexity floor + ceiling

A single deterministic AST-derived score drives both thresholds:

- **Floor** — a chunk below the floor is too small to justify its own subagent. Merge it into the chunk that dispatches into it. Don't spin up an author per one-activity fragment.
- **Ceiling** — caller-instructed; triggers #2. Set it to the largest chunk you want a single subagent to take on.

Defaults ship documented and tunable; adjust per design rather than treating them as fixed.

## Roots

Roots are **heuristic**: in-degree-0 in the binding subgraph, `asyncBacking` targets (external entries despite an in-edge), handler-bearing workflows (signal/query/update), and in-cycle workflows with no external binding in-edge. Each root is tagged `source: heuristic|declared`. Today all are heuristic; that is acceptable. Declared inbound roots will later seed at higher priority without changing this protocol.

Edge semantics worth knowing when reading output: `nexusCall` = contract cut; `asyncBacking` target = a root; `signalSend` = a *soft* edge that keeps two workflows in one blob but as **separate** roots/chunks (never treat it as a binding call edge).

## Selective dispatch against existing work

The decomposition is computed over the **design**. It does not know what is already implemented. Before dispatching any chunk:

1. Resolve the chunk's definitions to code via the `# impl: <dirs>` link header (see `temporal-architect-design`'s `twf-conventions.md`).
2. If there is **no linked code**, the chunk is new → dispatch an author.
3. If there **is** linked code, run the author skill's fast verify on it as a cheap changed-vs-unchanged signal — e.g. `author-go`'s `go build` / `go test` on the linked package. Treat a clean build/test against the current `.twf` as "unchanged, skip"; a failure or a `.twf` edit touching that chunk as "changed, dispatch."
4. **Skip unchanged chunks.** Never re-author a component that doesn't need altering — that is wasted context and risks churning working code.

This is a stopgap: there is no first-class chunk↔impl staleness check (chunk identity + impl link + a quick verify). The build/test signal is coarse but cheap. Tracked as a chunks-consumer backlog item.

## Pin contracts only where it pays

Pin types/signatures **rigidly only at the hard-boundary and cross-language cuts** — the interfaces that are expensive to renegotiate and that multiple subagents depend on. Everywhere else, hand the author a **loose API suggestion** and let it refine the shape as it implements, feeding genuine constraints back. Freezing everything up front is waterfall; it caps the authors' autonomy and produces conflicting rework, not less of it.

## Manual fallback

When `twf graph chunks` is unavailable:

1. Run `twf symbols` (or read the `.twf`) to list workflows, activities, and Nexus operations.
2. Seed roots heuristically: handler-bearing workflows, Nexus-op-backing workflows, and any workflow with no inbound call.
3. Walk call edges from each root to gather its reachable children; each connected component is a chunk.
4. Treat `nexus` operations as contract cuts (separate chunks either side).
5. Apply the same selective-dispatch and contract-pinning logic above.

This is coarser (no complexity score, no ranked cuts) but follows the identical dispatch discipline, so adopting the tool later changes the *input*, not the protocol.
