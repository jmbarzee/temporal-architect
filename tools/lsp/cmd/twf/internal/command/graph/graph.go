// Package graph implements `twf graph` — emit the resolved deployment graph of
// the input files. It owns the `chunks` child command (attached in New).
package graph

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/chunks"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/envelope"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
	"github.com/spf13/cobra"
)

// New builds the `graph` command and attaches its `chunks` child. --json and
// --history are persistent flags so the child inherits them and reads them off
// the merged flag set.
func New() *cobra.Command {
	var jsonOutput bool
	var historyDir string
	cmd := cmdutil.Silence(&cobra.Command{
		Use:   "graph [flags] <file...>",
		Short: "Show the resolved deployment graph; --json for envelope output",
		Long: `Emit the resolved deployment graph of the input files. Nodes are runtime
deployments; edges are confirmed dispatches between them.

Default input: one or more .twf files. History input (--history <dir>): a
sampler output tree rooted at <dir> with layout <namespace>/<type>/<id>.json.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmdutil.CodeToErr(run(args, jsonOutput, historyDir))
		},
	})
	cmd.PersistentFlags().BoolVar(&jsonOutput, "json", false, "Output in JSON envelope (default: text)")
	cmd.PersistentFlags().StringVar(&historyDir, "history", "", "Root dir of sampler output (<ns>/<type>/<id>.json); mutually exclusive with file arguments")
	cmd.AddCommand(chunks.New())
	return cmd
}

// run extracts and outputs the resolved deployment graph.
//
// Default input: one or more .twf files parsed into an AST → graph.Extract.
// History input (historyDir): a sampler output tree rooted at <dir>
// with layout <namespace>/<workflowType>/<id>.json → history.Build.
//
// Both modes emit the same JSON envelope so downstream tooling reads
// diagnostics and graph in one payload.
func run(paths []string, jsonOutput bool, historyDir string) int {
	// Mutual exclusion.
	if historyDir != "" && len(paths) > 0 {
		fmt.Fprintln(os.Stderr, "error: --history and file arguments are mutually exclusive")
		return 1
	}

	// History mode.
	if historyDir != "" {
		histories, err := envelope.LoadHistories(historyDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error loading histories: %v\n", err)
			return 1
		}
		g := history.Build(histories, history.Context{})
		diags := envelope.HistoryDiagnostics(g)
		if jsonOutput {
			return printJSON(nil, diags, g)
		}
		for _, d := range diags {
			fmt.Fprintln(os.Stderr, envelope.FormatDiagnostic(d))
		}
		return printText(g)
	}

	// .twf mode.
	if len(paths) == 0 {
		fmt.Fprintln(os.Stderr, "usage: twf graph [--json] [--history <dir>] <file...>")
		return 1
	}

	file, diags, err := envelope.ParseFiles(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	var g *graph.Graph
	if file != nil {
		g = graph.Extract(file)
		diags = append(diags, envelope.GraphDiagnostics(g)...)
	}

	if jsonOutput {
		return printJSON(file, diags, g)
	}

	for _, d := range diags {
		fmt.Fprintln(os.Stderr, envelope.FormatDiagnostic(d))
	}
	if g == nil {
		return 1
	}
	return printText(g)
}

// printJSON emits the standard twf envelope. graph may be nil
// when parsing failed catastrophically; the envelope still carries
// diagnostics so callers can act on them.
func printJSON(file *ast.File, diags []envelope.Diagnostic, g *graph.Graph) int {
	env := envelope.Envelope{
		Summary:     envelope.Summarize(file, diags),
		Diagnostics: envelope.EnsureSlice(diags),
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

// printText renders the graph in a compact human-readable form.
// Sections are omitted when empty so the happy-path output stays short.
func printText(g *graph.Graph) int {
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
