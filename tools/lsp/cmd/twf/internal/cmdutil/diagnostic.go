package cmdutil

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// FormatDiagnostic renders a Diagnostic in the legacy "kind error at L:C: msg"
// shape, augmented with [code]. This keeps text output compact enough for
// CI logs while still surfacing the symbolic code for grep.
//
// It is CLI-only text rendering: it lives on the cmd/twf side (not in the
// public pipeline package) so the wire contract carries no presentation logic.
func FormatDiagnostic(d pipeline.Diagnostic) string {
	loc := fmt.Sprintf("%d:%d", d.Start.Line, d.Start.Column)
	if d.File != "" {
		loc = d.File + ":" + loc
	}
	sev := d.Severity
	if sev == "" {
		sev = "error"
	}
	return fmt.Sprintf("%s [%s/%s] at %s: %s", sev, d.Kind, d.Code, loc, d.Message)
}
