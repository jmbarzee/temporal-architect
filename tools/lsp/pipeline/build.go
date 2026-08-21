package pipeline

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/decompose"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Payload is the parse→graph result for in-process consumers (the twf serve
// binary, issue #138). It marshals to the wrapped { ast, parserGraph,
// diagnostics } shape the visualizer's normalizePayload already consumes.
//
// It is a Go API only: deliberately NOT added to tools/wire-types/tygo.yaml.
// The visualizer consumes the wrapped shape by hand (normalizePayload in
// tools/visualizer/src/types/payload.ts), so no generated type is needed.
//
// Decomposition is the optional decomposition overlay (issue #156). Build leaves
// it nil; BuildDecompose produces it together with the graph in one call, so a
// Payload obtained from the pipeline API never carries a decomposition that
// disagrees with its Graph. When present it marshals to the `decomposition` key
// that normalizePayload already reads as an optional field, so the wrapped
// payload is additive on both sides.
//
// The field is exported and thus settable directly, but the sanctioned producer
// is BuildDecompose — see it for why decomposition is unified with the graph and
// for the deferred paths-coupled-vs-graph-keyed decision the history/sampler work
// will settle.
type Payload struct {
	AST           *ast.File         `json:"ast"`
	Graph         *graph.Graph      `json:"parserGraph,omitempty"`
	Diagnostics   []Diagnostic      `json:"diagnostics"`
	Decomposition *decompose.Result `json:"decomposition,omitempty"`
}

// Build parses + resolves + validates the given inputs and extracts the
// deployment graph, returning the assembled Payload. It is the single
// high-level entry point shared by the CLI graph path, the MCP graph tool,
// and the out-of-module server.
//
// Graph diagnostics are appended after the parse/resolve/validate diagnostics,
// mirroring the exact ordering the `twf graph` command uses, so the diagnostic
// order in the Payload matches the CLI.
func Build(paths []string) (Payload, error) {
	file, diags, err := ParseFiles(paths)
	if err != nil {
		return Payload{}, err
	}

	var g *graph.Graph
	if file != nil {
		g = graph.Extract(file)
		diags = append(diags, GraphDiagnostics(g)...)
	}

	return Payload{
		AST:         file,
		Graph:       g,
		Diagnostics: EnsureSlice(diags),
	}, nil
}
