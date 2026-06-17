package envelope_test

import (
	"encoding/json"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/clitest"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/envelope"
)

// TestParseFilesProducesStructuredDiagnostics covers the resolve and parse
// pipelines through ParseFiles, which is the single source of diagnostics
// for every CLI subcommand. We check the wire-format shape — severity, kind,
// code, position, message, name — for representative diagnostic kinds.
func TestParseFilesProducesStructuredDiagnostics(t *testing.T) {
	tests := []struct {
		name         string
		path         string
		wantKind     string
		wantCode     string
		wantSeverity string
		wantName     string
	}{
		{
			name:         "undefined activity reference",
			path:         clitest.Testdata("undefined_activity.twf"),
			wantKind:     "resolve",
			wantCode:     "UNDEFINED_ACTIVITY",
			wantSeverity: "error",
			wantName:     "NotAnActivity",
		},
		{
			name:         "duplicate workflow definition",
			path:         clitest.Testdata("duplicate_workflow.twf"),
			wantKind:     "resolve",
			wantCode:     "DUPLICATE_WORKFLOW",
			wantSeverity: "error",
			wantName:     "Twin",
		},
		{
			name:         "parser error",
			path:         clitest.Testdata("syntax_error.twf"),
			wantKind:     "parse",
			wantCode:     "SYNTAX",
			wantSeverity: "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, diags, err := envelope.ParseFiles([]string{tt.path})
			if err != nil {
				t.Fatalf("ParseFiles: %v", err)
			}
			if file == nil {
				t.Fatalf("ParseFiles returned nil file")
			}

			var found *envelope.Diagnostic
			for i := range diags {
				if diags[i].Kind == tt.wantKind && diags[i].Code == tt.wantCode {
					found = &diags[i]
					break
				}
			}
			if found == nil {
				t.Fatalf("no diagnostic with kind=%q code=%q; got %d diagnostics: %+v",
					tt.wantKind, tt.wantCode, len(diags), diags)
			}

			if found.Severity != tt.wantSeverity {
				t.Errorf("severity = %q, want %q", found.Severity, tt.wantSeverity)
			}
			if tt.wantName != "" && found.Name != tt.wantName {
				t.Errorf("name = %q, want %q", found.Name, tt.wantName)
			}
			if found.Start.Line == 0 {
				t.Errorf("start.line = 0, want >0 for diagnostic %+v", found)
			}
			if found.End != found.Start {
				// End is allowed to differ once span tracking lands. For now
				// the contract is end == start; flag drift so the test stays
				// honest as that contract changes.
				t.Logf("end != start (span tracking has been added): %+v", found)
			}
			if found.File == "" {
				t.Errorf("file is empty, want the input file basename")
			}
			if found.Message == "" {
				t.Errorf("message is empty")
			}
		})
	}
}

// TestParseFilesCleanFileYieldsNoErrors verifies the happy path: a valid
// .twf with no errors or warnings produces an empty diagnostic slice.
func TestParseFilesCleanFileYieldsNoErrors(t *testing.T) {
	file, diags, err := envelope.ParseFiles([]string{clitest.Testdata("clean.twf")})
	if err != nil {
		t.Fatalf("ParseFiles: %v", err)
	}
	if file == nil {
		t.Fatalf("nil AST")
	}
	for _, d := range diags {
		if d.Severity == "error" {
			t.Errorf("unexpected error diagnostic: %+v", d)
		}
	}
}

// TestSummarizeCountsDiagnostics ensures the envelope summary aggregates
// error and warning severities correctly. The CLI exit-code logic depends
// on this distinction (warnings must not flip exit codes).
func TestSummarizeCountsDiagnostics(t *testing.T) {
	file, diags, err := envelope.ParseFiles([]string{clitest.Testdata("undefined_activity.twf")})
	if err != nil {
		t.Fatalf("ParseFiles: %v", err)
	}
	s := envelope.Summarize(file, diags)
	if s.Errors == 0 {
		t.Errorf("summary.errors = 0, want >0")
	}
	if s.Workflows == 0 {
		t.Errorf("summary.workflows = 0, want >0 (partial parse should still count workflows)")
	}
}

// TestEnsureSliceNeverNullsDiagnostics guards the wire contract that
// `diagnostics` is always a JSON array (never null), even on the happy path.
func TestEnsureSliceNeverNullsDiagnostics(t *testing.T) {
	s := envelope.EnsureSlice(nil)
	if s == nil {
		t.Fatal("EnsureSlice returned nil")
	}
	data, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(data) != "[]" {
		t.Errorf("nil-slice marshals as %q, want \"[]\"", string(data))
	}
}

// TestEnvelopeJSONShape verifies that a successful parse round-trips through
// the Envelope and produces the documented top-level keys.
func TestEnvelopeJSONShape(t *testing.T) {
	file, diags, err := envelope.ParseFiles([]string{clitest.Testdata("clean.twf")})
	if err != nil {
		t.Fatalf("ParseFiles: %v", err)
	}

	fileBytes, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("marshal AST: %v", err)
	}
	var inner struct {
		Definitions json.RawMessage `json:"definitions"`
	}
	if err := json.Unmarshal(fileBytes, &inner); err != nil {
		t.Fatalf("splice AST: %v", err)
	}

	env := envelope.Envelope{
		Summary:     envelope.Summarize(file, diags),
		Diagnostics: envelope.EnsureSlice(diags),
		Definitions: inner.Definitions,
	}
	out, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal envelope: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(out, &decoded); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	for _, key := range []string{"summary", "diagnostics", "definitions"} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("envelope missing top-level key %q", key)
		}
	}
}

// TestFormatDiagnostic checks the text-mode rendering used by check / symbols
// / graph for stderr diagnostics. The format is part of the human-facing
// contract and is sensitive to changes (e.g. CI log filters); keep it stable.
func TestFormatDiagnostic(t *testing.T) {
	d := envelope.Diagnostic{
		Severity: "error",
		Kind:     "resolve",
		Code:     "UNDEFINED_ACTIVITY",
		File:     "foo.twf",
		Start:    envelope.Position{Line: 12, Column: 3},
		End:      envelope.Position{Line: 12, Column: 3},
		Message:  "undefined activity: Foo",
		Name:     "Foo",
	}
	got := envelope.FormatDiagnostic(d)
	want := "error [resolve/UNDEFINED_ACTIVITY] at foo.twf:12:3: undefined activity: Foo"
	if got != want {
		t.Errorf("FormatDiagnostic =\n  %q\nwant\n  %q", got, want)
	}
}

// TestLoadHistories verifies the sampler-output loader walks the two-level
// <namespace>/<type>/<id>.json tree and stamps each history's namespace.
func TestLoadHistories(t *testing.T) {
	histories, err := envelope.LoadHistories(clitest.Testdata("sample"))
	if err != nil {
		t.Fatalf("LoadHistories: %v", err)
	}
	if len(histories) != 2 {
		t.Fatalf("got %d histories, want 2", len(histories))
	}

	nsSeen := map[string]int{}
	for _, h := range histories {
		if h.Namespace == "" {
			t.Errorf("history %q has empty namespace", h.WorkflowID)
		}
		nsSeen[h.Namespace]++
		if len(h.Events) == 0 {
			t.Errorf("history %q has no events", h.WorkflowID)
		}
	}
	for _, ns := range []string{"ecommerce", "partner"} {
		if nsSeen[ns] == 0 {
			t.Errorf("no history found for namespace %q", ns)
		}
	}
}
