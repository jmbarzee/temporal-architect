package pipeline

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/decompose"
)

// Decompose computes the decomposition overlay for an already-assembled Payload
// and returns the Payload with its Decomposition field set. It is the canonical,
// in-process producer of the overlay (issue #156): every host — the served
// visualizer (issue #138), the extension, the npx dist path — chunks through
// this one call, so identical parameters yield identical chunk groupings.
//
// It is a free function, not a method: decomposition is offered as an API
// function composed after Build, so Build's existing callers (the CLI graph
// path, the MCP graph tool, serve) pay nothing for a mode they don't use.
//
//	p, err := pipeline.Build(paths)     // ast + parserGraph + diagnostics (unchanged)
//	p = pipeline.Decompose(p, opts)     // separate graph→chunks step
//
// Decompose is graph-keyed: it runs decompose.Decompose over the graph the
// Payload already carries (p.Graph), with p.AST as the complexity/roots
// refinement. This keys the step off the graph rather than off source paths,
// which is what leaves the sampler/history seam reachable: a future Payload
// built from a projected sampled/observed graph chunks through this same call —
// the engine tolerates a nil AST and falls back to graph-seeded base weights, so
// supporting observed decomposition later is a contained swap of the weight
// source at the computeComplexity seam, not a partition rewrite. That future
// stays out of scope per issue #156's non-goal; keeping this graph-keyed is the
// zero-cost factoring that leaves the seam open.
//
// Design note — a deliberately deferred decision (issue #156). This separable
// API is one of two coherent shapes, and it is the simpler one, not the settled
// one. Because Build and Decompose are distinct calls, nothing in the type system
// stops a caller from holding a Payload whose Graph and Decomposition were
// computed from different inputs: the overlay is only valid for the exact graph
// it was derived from, yet that consistency is a *caller* responsibility here,
// not a guarantee. The alternative is a single unified constructor that makes the
// divergence unrepresentable — structural safety, bought at the cost of ever
// producing an ast-only or decomposition-only payload, which the served recompute
// loop and (later) the history/sampler graphs may actually want. We do not yet
// know which pull is stronger, so we keep the simple separable form now and leave
// the choice to the work that will actually test it: when history / sampler
// decomposition is exercised for real, that should reveal whether to collapse
// Build+Decompose into one always-consistent call or to commit to separate,
// explicitly version-correlated payloads. Revisit then — not before. See also
// Payload.Decomposition (build.go) and isWrappedPayload
// (tools/visualizer/src/types/payload.ts) for the consumer-side face of this.
//
// A Payload with a nil Graph yields a nil-graph decomposition (an empty Result),
// mirroring decompose.Decompose's own contract.
func Decompose(p Payload, opts decompose.Options) Payload {
	p.Decomposition = decompose.Decompose(p.AST, p.Graph, opts)
	return p
}
