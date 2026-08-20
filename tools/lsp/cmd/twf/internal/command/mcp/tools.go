package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/symbols"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/decompose"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// filesInput is the shared input for the file-oriented tools. Provide either
// paths (read from the local filesystem) or inline source — at least one.
type filesInput struct {
	Paths  []string `json:"paths,omitempty" jsonschema:"One or more .twf file paths to analyze, resolved on the local filesystem where this server runs. Provide this or source."`
	Source string   `json:"source,omitempty" jsonschema:"Inline TWF source to analyze instead of reading from disk (e.g. an unsaved editor buffer). Provide this or paths."`
}

// chunksInput extends filesInput with the decomposition knobs of
// `twf graph chunks`.
type chunksInput struct {
	Paths    []string `json:"paths,omitempty" jsonschema:"One or more .twf file paths to decompose, resolved on the local filesystem where this server runs. Provide this or source."`
	Source   string   `json:"source,omitempty" jsonschema:"Inline TWF source to decompose instead of reading from disk. Provide this or paths."`
	Ceiling  int      `json:"ceiling,omitempty" jsonschema:"Complexity ceiling; chunks above it get ranked soft divisions. 0 (default) emits the hard partition only."`
	Floor    int      `json:"floor,omitempty" jsonschema:"Complexity floor; chunks below it are flagged too-granular. 0 selects the default, negative disables."`
	MaxDepth int      `json:"maxDepth,omitempty" jsonschema:"Max nesting depth for recursive re-division of over-ceiling sections. 0 selects the default, negative disables recursion."`
	By       []string `json:"by,omitempty" jsonschema:"Division strategy bias for over-ceiling chunks: any of tree, nexus, worker, namespace, service, subtree. Empty means all applicable."`
}

// resolveInput parses from inline source when provided, otherwise from the
// given file paths. It errors if neither is supplied.
func resolveInput(paths []string, src string) (*ast.File, []pipeline.Diagnostic, error) {
	if strings.TrimSpace(src) != "" {
		return pipeline.ParseSource("input.twf", src)
	}
	if len(paths) == 0 {
		return nil, nil, fmt.Errorf("provide either paths or source")
	}
	return pipeline.ParseFiles(paths)
}

// slugInput selects one spec section by slug.
type slugInput struct {
	Slug string `json:"slug" jsonschema:"The spec section slug to fetch (see twf_spec_list for available slugs)."`
}

// emptyInput is the object-typed input for tools that take no arguments.
type emptyInput struct{}

// readOnly marks every tool as a non-mutating, read-only operation.
var readOnly = &mcp.ToolAnnotations{ReadOnlyHint: true}

// registerTools installs the parser tool surface on the server. Each handler is
// a thin shell over the same tools/lsp/pipeline package and parser packages the
// CLI commands use, so the JSON returned is byte-identical to the corresponding
// `twf` subcommand output.
func registerTools(s *mcp.Server) {
	mcp.AddTool(s, &mcp.Tool{
		Name:        "twf_check",
		Title:       "Check TWF files",
		Description: "Parse and resolve one or more .twf files and return the diagnostics envelope (summary + diagnostics, no payload). The grammar/semantics gate to run after every .twf edit.",
		Annotations: readOnly,
	}, func(_ context.Context, _ *mcp.CallToolRequest, in filesInput) (*mcp.CallToolResult, any, error) {
		return jsonResult(buildCheck(in))
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "twf_parse",
		Title:       "Parse TWF files",
		Description: "Emit the canonical JSON envelope for one or more .twf files: the AST definitions plus diagnostics and a summary. Use to inspect the full parsed design.",
		Annotations: readOnly,
	}, func(_ context.Context, _ *mcp.CallToolRequest, in filesInput) (*mcp.CallToolResult, any, error) {
		return jsonResult(buildParse(in))
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "twf_symbols",
		Title:       "List TWF symbols",
		Description: "List the workflows, activities, workers, namespaces, and Nexus services defined across one or more .twf files, with their signatures.",
		Annotations: readOnly,
	}, func(_ context.Context, _ *mcp.CallToolRequest, in filesInput) (*mcp.CallToolResult, any, error) {
		return jsonResult(buildSymbols(in))
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "twf_graph",
		Title:       "Resolved deployment graph",
		Description: "Emit the resolved deployment graph of one or more .twf files: nodes are runtime deployments, edges are confirmed dispatches between them.",
		Annotations: readOnly,
	}, func(_ context.Context, _ *mcp.CallToolRequest, in filesInput) (*mcp.CallToolResult, any, error) {
		return jsonResult(buildGraph(in))
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "twf_graph_chunks",
		Title:       "Decompose into work chunks",
		Description: "Topology-based decomposition of a design into independently-implementable chunks of work over the deployment graph, with per-chunk complexity and the inter-chunk contract-dependency DAG.",
		Annotations: readOnly,
	}, func(_ context.Context, _ *mcp.CallToolRequest, in chunksInput) (*mcp.CallToolResult, any, error) {
		return jsonResult(buildChunks(in))
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "twf_spec_list",
		Title:       "List spec sections",
		Description: "List the slugs and titles of every section of the embedded TWF language specification. Pair with twf_spec_get to read one.",
		Annotations: readOnly,
	}, func(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
		return jsonResult(buildSpecList())
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "twf_spec_get",
		Title:       "Get a spec section",
		Description: "Print one section of the embedded TWF language specification, selected by slug (see twf_spec_list).",
		Annotations: readOnly,
	}, func(_ context.Context, _ *mcp.CallToolRequest, in slugInput) (*mcp.CallToolResult, any, error) {
		return buildSpecGet(in.Slug)
	})
}

// jsonResult adapts a (bytes, error) builder result into a tool result. A
// non-nil error becomes a tool error (packed into the result with IsError by
// the SDK); otherwise the JSON is returned as text content.
func jsonResult(data []byte, err error) (*mcp.CallToolResult, any, error) {
	if err != nil {
		return nil, nil, err
	}
	return textResult(string(data)), nil, nil
}

// textResult wraps a string as a single text-content tool result.
func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
}

// buildCheck mirrors `twf check` as structured output: the envelope carries the
// summary and diagnostics with no payload (check IS diagnostics).
func buildCheck(in filesInput) ([]byte, error) {
	file, diags, err := resolveInput(in.Paths, in.Source)
	if err != nil {
		return nil, err
	}
	env := pipeline.Envelope{
		Summary:     pipeline.Summarize(file, diags),
		Diagnostics: pipeline.EnsureSlice(diags),
	}
	return json.MarshalIndent(env, "", "  ")
}

// buildParse mirrors `twf parse`: the AST definitions spliced into the envelope
// alongside diagnostics and the summary.
func buildParse(in filesInput) ([]byte, error) {
	file, diags, err := resolveInput(in.Paths, in.Source)
	if err != nil {
		return nil, err
	}
	env := pipeline.Envelope{
		Summary:     pipeline.Summarize(file, diags),
		Diagnostics: pipeline.EnsureSlice(diags),
	}

	// Marshal the AST through its own MarshalJSON to get the `definitions`
	// shape, then splice it into the envelope under the same top-level key the
	// visualizer consumes — identical to the parse command.
	fileBytes, err := json.Marshal(file)
	if err != nil {
		return nil, fmt.Errorf("marshal AST: %w", err)
	}
	var inner struct {
		Definitions json.RawMessage `json:"definitions"`
	}
	if err := json.Unmarshal(fileBytes, &inner); err != nil {
		return nil, fmt.Errorf("splice AST: %w", err)
	}
	env.Definitions = inner.Definitions

	return json.MarshalIndent(env, "", "  ")
}

// buildSymbols mirrors `twf symbols --json`.
func buildSymbols(in filesInput) ([]byte, error) {
	file, diags, err := resolveInput(in.Paths, in.Source)
	if err != nil {
		return nil, err
	}
	var syms []symbols.SymbolJSON
	if file != nil {
		syms = symbols.Extract(file)
	}
	if syms == nil {
		syms = []symbols.SymbolJSON{}
	}
	env := pipeline.Envelope{
		Summary:     pipeline.Summarize(file, diags),
		Diagnostics: pipeline.EnsureSlice(diags),
		Symbols:     syms,
	}
	return json.MarshalIndent(env, "", "  ")
}

// buildGraph mirrors `twf graph --json`.
func buildGraph(in filesInput) ([]byte, error) {
	file, diags, err := resolveInput(in.Paths, in.Source)
	if err != nil {
		return nil, err
	}
	var g *graph.Graph
	if file != nil {
		g = graph.Extract(file)
		diags = append(diags, pipeline.GraphDiagnostics(g)...)
	}
	env := pipeline.Envelope{
		Summary:     pipeline.Summarize(file, diags),
		Diagnostics: pipeline.EnsureSlice(diags),
		Graph:       g,
	}
	return json.MarshalIndent(env, "", "  ")
}

// buildChunks mirrors `twf graph chunks --json`.
func buildChunks(in chunksInput) ([]byte, error) {
	file, diags, err := resolveInput(in.Paths, in.Source)
	if err != nil {
		return nil, err
	}
	opts := decompose.Options{
		Ceiling:  in.Ceiling,
		Floor:    in.Floor,
		MaxDepth: in.MaxDepth,
		By:       in.By,
	}
	var res *decompose.Result
	if file != nil {
		g := graph.Extract(file)
		diags = append(diags, pipeline.GraphDiagnostics(g)...)
		res = decompose.Decompose(file, g, opts)
	}
	env := pipeline.Envelope{
		Summary:     pipeline.Summarize(file, diags),
		Diagnostics: pipeline.EnsureSlice(diags),
		Chunks:      res,
	}
	return json.MarshalIndent(env, "", "  ")
}
