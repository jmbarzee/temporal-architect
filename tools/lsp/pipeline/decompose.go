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
// A Payload with a nil Graph yields a nil-graph decomposition (an empty Result),
// mirroring decompose.Decompose's own contract.
func Decompose(p Payload, opts decompose.Options) Payload {
	p.Decomposition = decompose.Decompose(p.AST, p.Graph, opts)
	return p
}
