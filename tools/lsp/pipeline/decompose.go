package pipeline

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/decompose"
)

// BuildDecompose parses the given inputs, extracts the graph, and computes the
// decomposition overlay in one call, returning a Payload whose ast, parserGraph,
// diagnostics, and decomposition are all consistent by construction. It is the
// canonical, in-process producer of the overlay (issue #156): every host — the
// served visualizer (issue #138), the extension, the npx dist path — chunks
// through this one call, so identical parameters yield identical chunk groupings.
//
// It is deliberately unified rather than a Build + separate-Decompose pair. A
// decomposition overlay is only valid for the exact graph it was derived from,
// and folding both into one call makes that consistency a property of the API
// rather than a caller responsibility: there is no public way to obtain a
// decomposition apart from the graph it belongs to, so the two can never be
// handed to a caller in a divergent state. Plain Build (ast + parserGraph +
// diagnostics, no decomposition) remains for callers that want the graph alone —
// the CLI graph path, the MCP graph tool, serve — and pays nothing for a mode
// they don't use.
//
// Design note — a deliberately deferred decision (issue #156). The unified
// constructor buys consistency-by-construction at a cost: BuildDecompose is keyed
// off source paths, so it cannot decompose a graph that did not come from a parse
// — which is exactly what the history/sampler path will need (an observed graph,
// no ast). The engine underneath stays graph-keyed: it runs decompose.Decompose
// over the extracted graph, and the ast only refines complexity/roots (a nil ast
// falls back to graph-seeded base weights). So the seam for observed
// decomposition is a contained swap of the weight source at the computeComplexity
// step, not a partition rewrite; what is NOT yet exposed is a public entry that
// decomposes a caller-supplied graph. When history / sampler decomposition is
// exercised for real, that is the test that should decide whether to add such a
// graph-keyed variant (reintroducing a separable path under controlled
// conditions) or keep decomposition unified. Revisit then — not before. See also
// Payload.Decomposition (build.go) and isWrappedPayload
// (tools/visualizer/src/types/payload.ts) for the consumer-side face of this.
func BuildDecompose(paths []string, opts decompose.Options) (Payload, error) {
	p, err := Build(paths)
	if err != nil {
		return Payload{}, err
	}
	// Graph-keyed under the hood: decompose over the graph Build extracted, with
	// p.AST as the complexity/roots refinement. A nil Graph yields an empty
	// Result, mirroring decompose.Decompose's own contract.
	p.Decomposition = decompose.Decompose(p.AST, p.Graph, opts)
	return p, nil
}
