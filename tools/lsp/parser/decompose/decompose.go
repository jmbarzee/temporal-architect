// Package decompose computes how a .twf design breaks into independently
// implementable chunks of work — the analysis behind `twf graph chunks`. The
// harness skill uses it to fan implementation out to author subagents at
// contract boundaries. The tool informs; it does not impose.
//
// It produces two outputs: hard boundaries (a mandatory partition the harness
// MUST honor) and soft divisions (ranked, strategy-driven cut suggestions the
// harness MAY use). See README.md for the architecture and pipeline.
package decompose

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// This file is the package front door: the Options that configure a run and the
// Decompose entry point that drives the pipeline. The stages it calls live in
// workgraph.go (build), complexity.go (metric + floor), roots.go (heuristic
// roots), components.go (SCC condensation + the decide phase: partition), and
// divisions.go (the explore phase: divisions). The output model lives in
// result.go.

// DefaultFloor is the complexity floor below which a hard chunk is flagged as
// "too granular for its own subagent". It is a documented default, not a
// calibrated value — tune it from real designs. The ceiling has no default:
// soft divisions are only explored when the caller instructs a ceiling.
const DefaultFloor = 2

// DefaultMaxDepth bounds how many levels of divisions the explore phase nests
// when recursively re-dividing over-ceiling sections (the top-level divisions
// are level 1). It is a safety belt — recursion already terminates because every
// division yields ≥2 strictly-smaller sections — and a context-protecting cap so
// the suggestion tree stays compact. Documented default, not a calibrated value.
const DefaultMaxDepth = 4

// Options configures a Decompose run.
type Options struct {
	// Floor is the complexity threshold below which a hard chunk is flagged
	// too-granular and recommended for merge. Zero selects DefaultFloor; a
	// negative value disables the floor entirely.
	Floor int
	// Ceiling, when > 0, triggers the explore phase (soft divisions) for any
	// chunk scoring above it. Zero (the default) emits the hard partition only.
	Ceiling int
	// By biases / filters the division strategies emitted for over-ceiling
	// chunks. Empty means "all applicable strategies". Recognized values:
	// StrategyTree, StrategyNexus, StrategyWorker, StrategyNamespace, StrategyHub.
	By []string
	// MaxDepth bounds recursive re-division of over-ceiling sections. Zero
	// selects DefaultMaxDepth; a negative value disables recursion (one level
	// only). Level 1 is the chunk's own divisions.
	MaxDepth int
}

// effectiveFloor resolves the floor with DefaultFloor / disable semantics.
func (o Options) effectiveFloor() int {
	if o.Floor == 0 {
		return DefaultFloor
	}
	if o.Floor < 0 {
		return 0
	}
	return o.Floor
}

// effectiveMaxDepth resolves the recursion depth with DefaultMaxDepth / disable
// semantics. A non-positive request collapses to 1 (top-level divisions only,
// no recursion).
func (o Options) effectiveMaxDepth() int {
	if o.MaxDepth == 0 {
		return DefaultMaxDepth
	}
	if o.MaxDepth < 0 {
		return 1
	}
	return o.MaxDepth
}

// Decompose computes the chunk decomposition for a resolved deployment graph.
//
// The node set and call structure come from the graph: distinct definitions
// (graph.Node.Definition already collapses deployment-duplicates back to one
// authorable unit) and edges mapped to those definition keys. The AST, when
// provided, enriches the result — it drives the complexity metric (body counts)
// and contributes handler-bearing roots. Passing a nil AST (e.g. a graph
// reconstructed from sampled history) still yields a structural decomposition
// with base complexity per node. A nil graph yields an empty Result.
//
// The pipeline: build the working graph → score complexity → condense SCCs →
// seed heuristic roots → decide the hard partition → apply the floor → explore
// ceiling-triggered divisions.
func Decompose(file *ast.File, g *graph.Graph, opts Options) *Result {
	floor := opts.effectiveFloor()
	res := &Result{
		Nodes:      []Node{},
		Roots:      []Root{},
		Chunks:     []Chunk{},
		ChunkEdges: []ChunkEdge{},
		Floor:      floor,
		Ceiling:    opts.Ceiling,
	}
	if g == nil {
		return res
	}

	wg := buildWorkGraph(g)
	wg.computeComplexity(file)
	wg.condense() // Tarjan SCC over the binding subgraph (roots read it)
	roots := wg.heuristicRoots(file)

	res.Nodes = wg.exportNodes()
	res.Roots = exportRoots(roots)
	res.Chunks, res.ChunkEdges = wg.partition(roots)

	applyFloor(res, floor)
	for i := range res.Chunks {
		res.Chunks[i].Advisories = wg.contractAdvisories(&res.Chunks[i])
	}
	if opts.Ceiling > 0 {
		exploreDivisions(wg, res, opts)
	}

	return res
}
