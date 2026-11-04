package pipeline

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// GraphDiagnostics lifts graph-stage warnings into the CLI's
// Diagnostic wire shape so they share the envelope with parse,
// resolve, and validate diagnostics. A graph diagnostic's file is the
// calling definition's source file.
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
			File:     d.File,
			Start:    Position{Line: d.Line, Column: 0},
			End:      Position{Line: d.Line, Column: 0},
			Message:  d.Message,
			Name:     d.From,
		})
	}
	return out
}
