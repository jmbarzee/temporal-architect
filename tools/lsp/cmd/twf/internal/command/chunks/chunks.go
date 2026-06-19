// Package chunks implements `twf graph chunks` — the topology-based
// decomposition of a design into independently-implementable chunks of work.
// It is wired as a child of the `graph` command, from which it inherits the
// --json and --history flags.
package chunks

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/envelope"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/decompose"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
	"github.com/spf13/cobra"
)

// New builds the `graph chunks` child command. --json and --history are
// inherited persistent flags declared on the parent `graph` command and read
// here via the merged flag set; --ceiling, --floor, and --by are local.
func New() *cobra.Command {
	var ceiling, floor, maxDepth int
	var by string
	cmd := cmdutil.Silence(&cobra.Command{
		Use:   "chunks [flags] <file...>",
		Short: "Topology-based work decomposition of the deployment graph",
		Long: `Decompose a design into independently-implementable chunks over the same
extracted deployment graph. Emits the #1 hard partition plus per-chunk
complexity and floor-merge recommendations; --ceiling additionally emits #2
ranked divisions for any chunk over the ceiling, recursively re-dividing any
section still over the ceiling. Recommendations are never auto-applied.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			jsonOutput, _ := cmd.Flags().GetBool("json")
			historyDir, _ := cmd.Flags().GetString("history")
			return cmdutil.CodeToErr(run(args, jsonOutput, historyDir, ceiling, floor, maxDepth, by))
		},
	})
	cmd.Flags().IntVar(&ceiling, "ceiling", 0, "Complexity ceiling; chunks above it get #2 ranked divisions (0 = hard partition only)")
	cmd.Flags().IntVar(&floor, "floor", 0, "Complexity floor; chunks below it are flagged too-granular (0 = default, negative = disabled)")
	cmd.Flags().IntVar(&maxDepth, "max-depth", 0, "Max nesting depth for recursive re-division of over-ceiling sections (0 = default, negative = no recursion)")
	cmd.Flags().StringVar(&by, "by", "", "Comma-separated division strategy bias: tree,nexus,worker,namespace,service,subtree")
	return cmd
}

// run implements `twf graph chunks` — the topology-based decomposition of a
// design into independently-implementable chunks.
//
// It runs the existing parse → resolve → graph.Extract pipeline (or
// envelope.LoadHistories + history.Build under historyDir), feeds the result
// to decompose.Decompose, and emits the standard JSON envelope under a
// "chunks" payload.
func run(paths []string, jsonOutput bool, historyDir string, ceiling, floor, maxDepth int, by string) int {
	opts := decompose.Options{
		Ceiling:  ceiling,
		Floor:    floor,
		MaxDepth: maxDepth,
		By:       splitStrategies(by),
	}

	if historyDir != "" && len(paths) > 0 {
		fmt.Fprintln(os.Stderr, "error: --history and file arguments are mutually exclusive")
		return 1
	}

	// History mode: decompose a graph reconstructed from sampled executions.
	// No AST is available, so complexity is base-only and handler roots are not
	// detected — the decomposition is purely structural.
	if historyDir != "" {
		histories, err := envelope.LoadHistories(historyDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error loading histories: %v\n", err)
			return 1
		}
		g := history.Build(histories, history.Context{})
		res := decompose.Decompose(nil, g, opts)
		diags := envelope.HistoryDiagnostics(g)
		return emitChunks(nil, diags, res, jsonOutput)
	}

	// .twf mode.
	if len(paths) == 0 {
		fmt.Fprintln(os.Stderr, "usage: twf graph chunks [--json] [--ceiling N] [--floor M] [--by tree,nexus,worker,namespace,service,subtree] [--history <dir>] <file...>")
		return 1
	}

	file, diags, err := envelope.ParseFiles(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	var res *decompose.Result
	if file != nil {
		g := graph.Extract(file)
		diags = append(diags, envelope.GraphDiagnostics(g)...)
		res = decompose.Decompose(file, g, opts)
	}

	return emitChunks(file, diags, res, jsonOutput)
}

// splitStrategies parses the comma-separated --by value into a strategy list,
// trimming blanks. Unknown values are tolerated and filtered out by decompose.
func splitStrategies(by string) []string {
	if strings.TrimSpace(by) == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(by, ",") {
		if s := strings.TrimSpace(part); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// emitChunks renders the decomposition as JSON envelope or human-readable text.
func emitChunks(file *ast.File, diags []envelope.Diagnostic, res *decompose.Result, jsonOutput bool) int {
	if jsonOutput {
		env := envelope.Envelope{
			Summary:     envelope.Summarize(file, diags),
			Diagnostics: envelope.EnsureSlice(diags),
			Chunks:      res,
		}
		data, err := json.MarshalIndent(env, "", "  ")
		if err != nil {
			fmt.Fprintf(os.Stderr, "json marshal error: %v\n", err)
			return 1
		}
		fmt.Println(string(data))
		return 0
	}

	for _, d := range diags {
		fmt.Fprintln(os.Stderr, envelope.FormatDiagnostic(d))
	}
	if res == nil {
		return 1
	}
	return printText(res)
}

// printText renders the decomposition compactly. The #1 hard partition is
// always shown; #2 divisions appear only when a ceiling triggered them.
func printText(res *decompose.Result) int {
	fmt.Printf("Decomposition: %d hard chunk(s), floor=%d", len(res.Chunks), res.Floor)
	if res.Ceiling > 0 {
		fmt.Printf(", ceiling=%d", res.Ceiling)
	}
	fmt.Println()
	fmt.Println()

	for _, c := range res.Chunks {
		flags := ""
		if c.Cyclic {
			flags += " [loop]"
		}
		if c.BelowFloor {
			if c.MergeInto != "" {
				flags += fmt.Sprintf(" [below floor → merge into %s]", c.MergeInto)
			} else {
				flags += " [below floor]"
			}
		}
		fmt.Printf("%s (complexity %d)%s\n", c.ID, c.Complexity, flags)

		roots := make([]string, 0, len(c.Roots))
		for _, r := range c.Roots {
			roots = append(roots, r.Key)
		}
		fmt.Printf("  roots:   %s\n", strings.Join(roots, ", "))
		fmt.Printf("  members: %s\n", strings.Join(c.Members, ", "))
		if len(c.Overlap) > 0 {
			fmt.Printf("  overlap: %s\n", strings.Join(c.Overlap, ", "))
		}
		for _, a := range c.Advisories {
			fmt.Printf("  advisory [%s] %s: %s\n", a.Kind, a.Subject, a.Detail)
		}
		printDivisions(c.Divisions, "  ")
		fmt.Println()
	}

	printChunkEdges(res)
	return 0
}

// printDivisions renders a division list and its recursive sub-divisions,
// indenting one step per nesting level. A section that was re-divided prints its
// nested division(s) beneath it.
func printDivisions(divs []decompose.Division, indent string) {
	for _, d := range divs {
		fmt.Printf("%sdivision #%d [%s]: %s\n", indent, d.Rank, d.Strategy, d.Rationale)
		for _, s := range d.Sections {
			fmt.Printf("%s  section %s (complexity %d): %s\n", indent, s.ID, s.Complexity, strings.Join(s.Members, ", "))
			if len(s.Divisions) > 0 {
				printDivisions(s.Divisions, indent+"    ")
			}
		}
		for _, e := range d.DAG {
			fmt.Printf("%s  depends: %s -> %s\n", indent, e.From, e.To)
		}
	}
}

// printChunkEdges renders the inter-chunk contract dependency DAG, if any.
func printChunkEdges(res *decompose.Result) {
	if len(res.ChunkEdges) > 0 {
		fmt.Println("Contract dependencies (between chunks):")
		edges := make([]string, 0, len(res.ChunkEdges))
		for _, e := range res.ChunkEdges {
			edges = append(edges, fmt.Sprintf("  %s -[%s]-> %s", e.From, e.Via, e.To))
		}
		sort.Strings(edges)
		for _, e := range edges {
			fmt.Println(e)
		}
		fmt.Println()
	}
}
