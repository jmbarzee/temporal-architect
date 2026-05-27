package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// graphCommand extracts and outputs the resolved deployment graph.
//
// Text mode renders a human-readable summary and writes parser /
// resolver / validator diagnostics to stderr alongside graph-stage
// diagnostics. JSON mode wraps the graph in the standard twf envelope
// so downstream tooling reads diagnostics and graph in one payload.
func graphCommand(args []string) int {
	fs := flag.NewFlagSet("graph", flag.ContinueOnError)
	jsonOutput := fs.Bool("json", false, "Output in JSON envelope (default: text)")
	if err := fs.Parse(args); err != nil {
		return 1
	}

	paths := fs.Args()
	if len(paths) == 0 {
		fmt.Fprintln(os.Stderr, "usage: twf graph [--json] <file...>")
		return 1
	}

	file, diags, err := parseFiles(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	var g *graph.Graph
	if file != nil {
		g = graph.Extract(file)
		diags = append(diags, graphDiagnostics(g)...)
	}

	if *jsonOutput {
		return printGraphJSON(file, diags, g)
	}

	for _, d := range diags {
		fmt.Fprintln(os.Stderr, formatDiagnostic(d))
	}
	if g == nil {
		return 1
	}
	return printGraphText(g)
}

// printGraphJSON emits the standard twf envelope. graph may be nil
// when parsing failed catastrophically; the envelope still carries
// diagnostics so callers can act on them.
func printGraphJSON(file *ast.File, diags []Diagnostic, g *graph.Graph) int {
	env := Envelope{
		Summary:     summarize(file, diags),
		Diagnostics: ensureSlice(diags),
		Graph:       g,
	}
	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "json marshal error: %v\n", err)
		return 1
	}
	fmt.Println(string(data))
	return 0
}

// printGraphText renders the graph in a compact human-readable form.
// Sections are omitted when empty so the happy-path output stays short.
func printGraphText(g *graph.Graph) int {
	fmt.Printf("Deployment graph: %d node(s), %d edge(s), %d coarsened edge(s)\n",
		g.Summary.Nodes, g.Summary.Edges, g.Summary.CoarsenedEdges)
	if g.Summary.Unresolved > 0 || g.Summary.Diagnostics > 0 {
		fmt.Printf("%d unresolved reference(s), %d diagnostic(s)\n",
			g.Summary.Unresolved, g.Summary.Diagnostics)
	}
	fmt.Println()

	// Group dispatch + containment edges by `from` for legibility.
	bySource := make(map[string][]graph.Edge)
	containmentOnly := make(map[string][]graph.Edge)
	for _, e := range g.Edges {
		if e.Kind == graph.EdgeContainment {
			containmentOnly[e.From] = append(containmentOnly[e.From], e)
		} else {
			bySource[e.From] = append(bySource[e.From], e)
		}
	}

	if len(bySource) > 0 {
		fmt.Println("Dispatch edges:")
		sources := make([]string, 0, len(bySource))
		for s := range bySource {
			sources = append(sources, s)
		}
		sort.Strings(sources)
		for _, src := range sources {
			fmt.Printf("  %s:\n", src)
			for _, e := range bySource[src] {
				routing := formatRouting(e.Routing)
				fmt.Printf("    -[%s]-> %s (line %d)%s\n", e.Kind, e.To, e.Line, routing)
			}
		}
		fmt.Println()
	}

	if len(containmentOnly) > 0 {
		fmt.Println("Containment:")
		sources := make([]string, 0, len(containmentOnly))
		for s := range containmentOnly {
			sources = append(sources, s)
		}
		sort.Strings(sources)
		for _, src := range sources {
			for _, e := range containmentOnly[src] {
				fmt.Printf("  %s -> %s\n", src, e.To)
			}
		}
		fmt.Println()
	}

	if len(g.CoarsenedEdges) > 0 {
		fmt.Println("Coarsened edges:")
		for _, ce := range g.CoarsenedEdges {
			fmt.Printf("  [%s] %s -> %s (weight %d)\n", ce.Tier, ce.From, ce.To, ce.Weight)
		}
		fmt.Println()
	}

	if len(g.Unresolved) > 0 {
		fmt.Println("Unresolved references:")
		for _, u := range g.Unresolved {
			fmt.Printf("  %s -> %s (%s, line %d)\n", u.From, u.Name, u.Kind, u.Line)
		}
		fmt.Println()
	}

	return 0
}

// formatRouting returns a compact suffix for a dispatch edge's
// routing block: " {explicit=...}" or " {endpoint=...}" depending on
// which field is set. Empty routing renders as "".
func formatRouting(r *graph.Routing) string {
	if r == nil {
		return ""
	}
	switch {
	case r.NexusEndpoint != "":
		return fmt.Sprintf(" {endpoint=%s}", r.NexusEndpoint)
	case r.Explicit != "":
		return fmt.Sprintf(" {explicit=%s}", r.Explicit)
	default:
		return ""
	}
}

// graphDiagnostics lifts graph-stage warnings into the CLI's
// Diagnostic wire shape so they share the envelope with parse,
// resolve, and validate diagnostics. The graph stage doesn't
// distinguish a "file" because its inputs are the merged AST; the
// File field is left empty and consumers fall back to line/column.
func graphDiagnostics(g *graph.Graph) []Diagnostic {
	if g == nil {
		return nil
	}
	out := make([]Diagnostic, 0, len(g.Diagnostics))
	for _, d := range g.Diagnostics {
		out = append(out, Diagnostic{
			Severity: d.Severity,
			Kind:     "graph",
			Code:     d.Code,
			Start:    Position{Line: d.Line, Column: 0},
			End:      Position{Line: d.Line, Column: 0},
			Message:  d.Message,
			Name:     d.From,
		})
	}
	return out
}
