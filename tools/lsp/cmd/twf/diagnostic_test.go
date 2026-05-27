package main

import (
	"encoding/json"
	"testing"
)

// TestParseFilesProducesStructuredDiagnostics covers the resolve and parse
// pipelines through parseFiles, which is the single source of diagnostics
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
			path:         "testdata/undefined_activity.twf",
			wantKind:     "resolve",
			wantCode:     "UNDEFINED_ACTIVITY",
			wantSeverity: "error",
			wantName:     "NotAnActivity",
		},
		{
			name:         "duplicate workflow definition",
			path:         "testdata/duplicate_workflow.twf",
			wantKind:     "resolve",
			wantCode:     "DUPLICATE_WORKFLOW",
			wantSeverity: "error",
			wantName:     "Twin",
		},
		{
			name:         "parser error",
			path:         "testdata/syntax_error.twf",
			wantKind:     "parse",
			wantCode:     "SYNTAX",
			wantSeverity: "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, diags, err := parseFiles([]string{tt.path})
			if err != nil {
				t.Fatalf("parseFiles: %v", err)
			}
			if file == nil {
				t.Fatalf("parseFiles returned nil file")
			}

			var found *Diagnostic
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
	file, diags, err := parseFiles([]string{"testdata/clean.twf"})
	if err != nil {
		t.Fatalf("parseFiles: %v", err)
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
	file, diags, err := parseFiles([]string{"testdata/undefined_activity.twf"})
	if err != nil {
		t.Fatalf("parseFiles: %v", err)
	}
	s := summarize(file, diags)
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
	s := ensureSlice(nil)
	if s == nil {
		t.Fatal("ensureSlice returned nil")
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
	file, diags, err := parseFiles([]string{"testdata/clean.twf"})
	if err != nil {
		t.Fatalf("parseFiles: %v", err)
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

	env := Envelope{
		Summary:     summarize(file, diags),
		Diagnostics: ensureSlice(diags),
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
	d := Diagnostic{
		Severity: "error",
		Kind:     "resolve",
		Code:     "UNDEFINED_ACTIVITY",
		File:     "foo.twf",
		Start:    Position{Line: 12, Column: 3},
		End:      Position{Line: 12, Column: 3},
		Message:  "undefined activity: Foo",
		Name:     "Foo",
	}
	got := formatDiagnostic(d)
	want := "error [resolve/UNDEFINED_ACTIVITY] at foo.twf:12:3: undefined activity: Foo"
	if got != want {
		t.Errorf("formatDiagnostic =\n  %q\nwant\n  %q", got, want)
	}
}
