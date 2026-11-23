package pipeline

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// GraphDiagnostics lifts graph-stage warnings into the CLI's
// Diagnostic wire shape so they share the envelope with parse,
// resolve, and validate diagnostics.
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
			Site:     d.Site,
			Message:  d.Message,
			Name:     d.From,
		})
	}
	return out
}
