package cmdutil_test

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// TestFormatDiagnostic checks the text-mode rendering used by check / symbols
// / graph for stderr diagnostics. The format is part of the human-facing
// contract and is sensitive to changes (e.g. CI log filters); keep it stable.
func TestFormatDiagnostic(t *testing.T) {
	d := pipeline.Diagnostic{
		Severity: "error",
		Kind:     "resolve",
		Code:     "UNDEFINED_ACTIVITY",
		File:     "foo.twf",
		Start:    pipeline.Position{Line: 12, Column: 3},
		End:      pipeline.Position{Line: 12, Column: 3},
		Message:  "undefined activity: Foo",
		Name:     "Foo",
	}
	got := cmdutil.FormatDiagnostic(d)
	want := "error [resolve/UNDEFINED_ACTIVITY] at foo.twf:12:3: undefined activity: Foo"
	if got != want {
		t.Errorf("FormatDiagnostic =\n  %q\nwant\n  %q", got, want)
	}
}
