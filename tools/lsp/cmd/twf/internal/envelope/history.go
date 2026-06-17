package envelope

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
)

// LoadHistories walks the two-level sampler output tree:
//
//	<root>/<namespace>/<workflowType>/<id>.json
//
// The namespace is taken from the first path segment under root. The
// workflowID is the file's base name without the .json extension. It is shared
// by the `graph` and `graph chunks` commands, which both reconstruct a graph
// from sampled executions.
func LoadHistories(root string) ([]history.History, error) {
	nsDirs, err := os.ReadDir(root)
	if err != nil {
		return nil, fmt.Errorf("read root dir %q: %w", root, err)
	}

	var out []history.History
	for _, nsEntry := range nsDirs {
		if !nsEntry.IsDir() {
			continue
		}
		nsName := nsEntry.Name()
		nsPath := filepath.Join(root, nsName)

		typeDirs, err := os.ReadDir(nsPath)
		if err != nil {
			return nil, fmt.Errorf("read namespace dir %q: %w", nsPath, err)
		}

		for _, typeEntry := range typeDirs {
			if !typeEntry.IsDir() {
				continue
			}
			typePath := filepath.Join(nsPath, typeEntry.Name())

			histFiles, err := os.ReadDir(typePath)
			if err != nil {
				return nil, fmt.Errorf("read type dir %q: %w", typePath, err)
			}

			for _, hf := range histFiles {
				if hf.IsDir() || !strings.HasSuffix(hf.Name(), ".json") {
					continue
				}
				wfID := strings.TrimSuffix(hf.Name(), ".json")
				h, err := history.LoadFile(filepath.Join(typePath, hf.Name()), wfID)
				if err != nil {
					return nil, fmt.Errorf("load %s: %w", filepath.Join(typePath, hf.Name()), err)
				}
				h.Namespace = nsName
				out = append(out, h)
			}
		}
	}
	return out, nil
}

// HistoryDiagnostics converts graph.Unresolved entries produced by the
// history importer into the envelope Diagnostic shape. Unresolved signal
// targets arise when the signal's target workflow execution was not included
// in the sampled histories.
func HistoryDiagnostics(g *graph.Graph) []Diagnostic {
	if g == nil {
		return nil
	}
	out := make([]Diagnostic, 0, len(g.Unresolved)+len(g.Diagnostics))
	for _, u := range g.Unresolved {
		out = append(out, Diagnostic{
			Severity: "warning",
			Kind:     "graph",
			Code:     "SIGNAL_TARGET_NOT_SAMPLED",
			Message:  fmt.Sprintf("signal target workflow %q not found in sampled histories", u.Name),
			Name:     u.From,
			Start:    Position{},
			End:      Position{},
		})
	}
	out = append(out, GraphDiagnostics(g)...)
	return out
}

// GraphDiagnostics lifts graph-stage warnings into the CLI's
// Diagnostic wire shape so they share the envelope with parse,
// resolve, and validate diagnostics. The graph stage doesn't
// distinguish a "file" because its inputs are the merged AST; the
// File field is left empty and consumers fall back to line/column.
func GraphDiagnostics(g *graph.Graph) []Diagnostic {
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
