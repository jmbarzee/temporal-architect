package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/decompose"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
)

// chunksCommand implements `twf graph chunks` — the topology-based
// decomposition of a design into independently-implementable chunks.
//
// It is a thin wrapper: it runs the existing parse → resolve → graph.Extract
// pipeline (or history.Build under --history), feeds the result to
// decompose.Decompose, and emits the standard JSON envelope under a "chunks"
// payload. The definition-collapse is internal to decompose; there is no
// `graph defs` lens this pass.
//
// Default: the #1 hard partition + per-chunk complexity + floor-merge
// recommendations. With --ceiling N it additionally emits #2 ranked divisions
// and a dependency DAG for any chunk over the ceiling. The tool informs; the
// floor merge and divisions are recommendations, never auto-applied.
func chunksCommand(args []string) int {
	fs := flag.NewFlagSet("graph chunks", flag.ContinueOnError)
	jsonOutput := fs.Bool("json", false, "Output in JSON envelope (default: text)")
	historyDir := fs.String("history", "", "Root dir of sampler output (<ns>/<type>/<id>.json); mutually exclusive with file arguments")
	ceiling := fs.Int("ceiling", 0, "Complexity ceiling; chunks above it get #2 ranked divisions (0 = hard partition only)")
	floor := fs.Int("floor", 0, "Complexity floor; chunks below it are flagged too-granular (0 = default, negative = disabled)")
	by := fs.String("by", "", "Comma-separated division strategy bias: tree,nexus,worker,namespace")
	if err := fs.Parse(args); err != nil {
		return 1
	}

	opts := decompose.Options{
		Ceiling: *ceiling,
		Floor:   *floor,
		By:      splitStrategies(*by),
	}

	paths := fs.Args()
	if *historyDir != "" && len(paths) > 0 {
		fmt.Fprintln(os.Stderr, "error: --history and file arguments are mutually exclusive")
		return 1
	}

	// History mode: decompose a graph reconstructed from sampled executions.
	// No AST is available, so complexity is base-only and handler roots are not
	// detected — the decomposition is purely structural.
	if *historyDir != "" {
		histories, err := loadHistoriesFromDir(*historyDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error loading histories: %v\n", err)
			return 1
		}
		g := history.Build(histories, history.Context{})
		res := decompose.Decompose(nil, g, opts)
		diags := historyDiagnostics(g)
		return emitChunks(nil, diags, res, *jsonOutput)
	}

	// .twf mode.
	if len(paths) == 0 {
		fmt.Fprintln(os.Stderr, "usage: twf graph chunks [--json] [--ceiling N] [--floor M] [--by tree,nexus,worker,namespace] [--history <dir>] <file...>")
		return 1
	}

	file, diags, err := parseFiles(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	var res *decompose.Result
	if file != nil {
		g := graph.Extract(file)
		diags = append(diags, graphDiagnostics(g)...)
		res = decompose.Decompose(file, g, opts)
	}

	return emitChunks(file, diags, res, *jsonOutput)
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
func emitChunks(file *ast.File, diags []Diagnostic, res *decompose.Result, jsonOutput bool) int {
	if jsonOutput {
		env := Envelope{
			Summary:     summarize(file, diags),
			Diagnostics: ensureSlice(diags),
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
		fmt.Fprintln(os.Stderr, formatDiagnostic(d))
	}
	if res == nil {
		return 1
	}
	return printChunksText(res)
}

// printChunksText renders the decomposition compactly. The #1 hard partition is
// always shown; #2 divisions appear only when a ceiling triggered them.
func printChunksText(res *decompose.Result) int {
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
		for _, d := range c.Divisions {
			fmt.Printf("  division #%d [%s]: %s\n", d.Rank, d.Strategy, d.Rationale)
			for _, s := range d.Sections {
				fmt.Printf("    section %s (complexity %d): %s\n", s.ID, s.Complexity, strings.Join(s.Members, ", "))
			}
			for _, e := range d.DAG {
				fmt.Printf("    depends: %s -> %s\n", e.From, e.To)
			}
		}
		fmt.Println()
	}

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

	return 0
}
