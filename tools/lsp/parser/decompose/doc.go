// Package decompose computes how a .twf design breaks into independently
// implementable chunks of work. It is the analysis behind `twf graph chunks`,
// whose sole consumer is the temporal-architect harness skill: it uses the
// decomposition to fan implementation work out to author subagents at contract
// boundaries.
//
// The tool informs; it does not impose. It reports two cleanly-typed outputs:
//
//   - #1 Hard boundaries — discovered facts about the graph (today: isolated
//     components; later, additively: language and other enforced boundaries).
//     Every definition lands in exactly one hard chunk. The harness MUST
//     dispatch separate subagents across these.
//   - #2 Soft divisions — discovered options over a chunk that exceeds an
//     instructed complexity ceiling, emitted as ranked candidate cuts plus a
//     per-division dependency DAG. The harness MAY use them.
//
// # Posture: a pure consumer of the parser pipeline
//
// decompose is a sibling of parser/graph and a pure consumer of existing types,
// exactly like the validator / LSP / codegen consumers. It reads the AST
// (definitions + bodies) and the resolved deployment graph (dispatch edges) and
// emits its own types. There are no changes to lexer → parser → resolver →
// validator → graph.
//
// # Collapsing deployment-duplicates; AST + graph used together
//
// The graph duplicates by deployment: one workflow registered on two workers is
// two graph nodes, but one thing to author. decompose keys both its node set and
// its structure on the definition key — the leftmost kind:Name segment of a node
// ID, already exposed as graph.Node.Definition — which collapses
// deployment-duplicates back to one authorable unit with no separate
// "projection" construct. Per-node deployment facts (hosting workers /
// namespaces / langs) are retained as attributes for #1b (language split) and
// the deferred grouping lens.
//
// The AST is used together with the graph: when supplied it drives the
// complexity metric (body counts) and contributes handler-bearing roots. The
// decomposition is otherwise structural, so it also runs over a graph
// reconstructed from sampled history (no AST), where every node carries base
// complexity.
//
// # Edge semantics
//
// Three dispatch-edge kinds drive correctness:
//
//   - nexusCall is the cleanest contract cut (cross-namespace/worker by
//     construction); it is excluded from the hard partition and instead forms
//     the inter-chunk dependency DAG.
//   - an asyncBacking target is a root (an external entry) despite carrying an
//     in-edge.
//   - signalSend is a soft edge: it keeps two workflows in the same blob but
//     they are separate roots; it must not be treated as a binding call edge.
//
// activityCall / workflowCall / asyncBacking are binding edges (call structure);
// nexusRoute and containment are not call structure and are ignored.
//
// # Loops
//
// Workflow-call cycles are condensed with Tarjan's SCC algorithm into a single
// node, so a chunk that is one cycle condenses to one node and has no internal
// seam to cut. Loops are therefore never cut this pass; the raised loop ceiling
// above which subtrees may be extracted is deferred (see the chunks BACKLOG).
package decompose
