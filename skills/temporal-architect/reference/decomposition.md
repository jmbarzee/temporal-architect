# Decomposition + Dispatch Protocol

How to turn a `.twf` design into a dispatch plan for author subagents. Every output of `twf graph chunks` is input to your judgment, not a command. Run `twf graph chunks --help` for the current flags.

## Thresholds

One deterministic, AST-derived complexity score drives both:

- **Floor** (`--floor`, has a default) — a chunk below it is too small for its own subagent; merge it into the chunk that dispatches into it.
- **Ceiling** (`--ceiling`, off by default) — set it to the largest chunk one subagent should take on; chunks above it get soft divisions.

`--max-depth` bounds how deep an over-ceiling section is re-divided (level 1 is the chunk's own divisions). `--by` biases the suggested strategy through one of two lenses, because thin-neck composition trees and thick-neck shared services need opposite signals:

- *use-case / balance* — `tree` (reachable subtree), `nexus` (`nexusCall` boundary), `worker`, `namespace`.
- *authorship parallelism* — `service` (extract the highest-fan-in hub and its dominated closure, split the rest into binding components) and `subtree` (peel the heaviest dominated child-workflow subtrees until the trunk fits, leaving light branches inline).

## Hard boundaries — MUST dispatch separately

Discovered facts, one author subagent per hard chunk:

- **Isolated components** — disconnected call structure is independent work.
- **`nexusCall` cuts** — cross-namespace/worker by construction; the Nexus operation signature *is* the contract.
- **Language boundaries** — a hard split once `@lang` lands ([#23](https://github.com/jmbarzee/temporal-architect/issues/23)).

Every definition lands in exactly one hard chunk. A node reachable from two roots is reported as **overlap**: implement it once and let both chunks consume it.

## Soft divisions — MAY use

- The **ranked candidate cuts** are suggestions: pick one that matches a real domain boundary, or decline to cut.
- The **dependency DAG is the build order**: author independent sections first, then what they unblock.
- **Loops are never cut**: a workflow-call cycle is collapsed into one chunk regardless of score.
- **Sections recurse** down to max-depth, so read the whole tree before dispatching.

A chunk may also carry a `suggestContract` **advisory**: a node so heavily shared that pinning its signature (or promoting it to a Nexus operation) buys more than cutting around it. Treat it as a prompt to pin a contract, not as a cut.

## Roots and edges

Roots are heuristic (`source: heuristic`): in-degree 0 in the binding subgraph, `asyncBacking` targets (external entries despite an in-edge), handler-bearing workflows (signal/query/update), and in-cycle workflows with no external binding in-edge. Declared roots will later seed at higher priority ([#5](https://github.com/jmbarzee/temporal-architect/issues/5)).

`signalSend` is a soft edge: it keeps two workflows in one blob but as separate roots and chunks — never a binding call.

## Selective dispatch

The decomposition knows the design, not what is already implemented. For each chunk:

1. Resolve its code through the `# impl: <dirs>` header (design skill's `twf-conventions.md`).
2. No linked code → new → dispatch an author.
3. Linked code → run the author's fast verify (e.g. `go build` / `go test` on the linked package). Clean against the current `.twf` → skip; a failure, or a `.twf` edit touching the chunk → dispatch.

Never re-author a component that doesn't need it. This build/test signal is a coarse stopgap for a missing chunk↔impl staleness check ([#40](https://github.com/jmbarzee/temporal-architect/issues/40)).

## Pin contracts only where it pays

Pin types and signatures rigidly only at hard-boundary and cross-language cuts — the interfaces multiple subagents depend on and that are expensive to renegotiate. Elsewhere, hand the author a loose API suggestion and let constraints found while implementing refine it. Freezing everything up front is waterfall: it produces conflicting rework, not less.

## Manual fallback

When `twf graph chunks` is unavailable:

1. List workflows, activities, and Nexus operations with `twf symbols` (or read the `.twf`).
2. Seed roots: handler-bearing workflows, Nexus-op-backing workflows, and workflows with no inbound call.
3. Roots and their reachable children form connected components; each component is a chunk. Treat Nexus operations as cuts.
4. Apply selective dispatch and contract pinning as above.

Coarser: no scores, no ranked cuts.
