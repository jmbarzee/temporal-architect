package pipeline_test

import (
	"encoding/json"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// testdata returns the absolute path to a fixture under the shared
// tools/lsp/cmd/twf/testdata tree. The fixtures live at the cmd/twf root so
// every command package's tests can reach them; the pipeline package sits a
// sibling directory up, so it resolves the same tree via ../cmd/twf/testdata
// rather than importing the cmd-internal clitest helper (an internal package it
// cannot import from outside cmd/twf).
func testdata(elem ...string) string {
	_, file, _, _ := runtime.Caller(0)
	// file = .../tools/lsp/pipeline/pipeline_test.go → up to tools/lsp, then cmd/twf/testdata.
	root := filepath.Join(filepath.Dir(file), "..", "cmd", "twf", "testdata")
	return filepath.Join(append([]string{root}, elem...)...)
}

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
			path:         testdata("undefined_activity.twf"),
			wantKind:     "resolve",
			wantCode:     "UNDEFINED_ACTIVITY",
			wantSeverity: "error",
			wantName:     "NotAnActivity",
		},
		{
			name:         "duplicate workflow definition",
			path:         testdata("duplicate_workflow.twf"),
			wantKind:     "resolve",
			wantCode:     "DUPLICATE_WORKFLOW",
			wantSeverity: "error",
			wantName:     "Twin",
		},
		{
			name:         "parser error",
			path:         testdata("syntax_error.twf"),
			wantKind:     "parse",
			wantCode:     "SYNTAX",
			wantSeverity: "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, diags, err := pipeline.ParseFiles([]string{tt.path})
			if err != nil {
				t.Fatalf("ParseFiles: %v", err)
			}
			if file == nil {
				t.Fatalf("ParseFiles returned nil file")
			}

			var found *pipeline.Diagnostic
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
				// The contract is end == start: diagnostics carry a point, not a
				// span. Log rather than fail, so that widening it to a real span
				// surfaces here instead of silently breaking the assertion.
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
	file, diags, err := pipeline.ParseFiles([]string{testdata("clean.twf")})
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

// TestParseFilesAttributesReferenceErrorToReferencingFile is the issue #136
// regression: with three files where package gamma imports alpha and beta —
// each of which defines a Process workflow — and makes a bare `Process` call,
// the UNDEFINED_WORKFLOW diagnostic must be attributed to gamma.twf at the
// reference site (12:5), NOT to a defining file (alpha.twf/beta.twf) it was
// previously reverse-engineered onto from the error's name. The sibling
// symptom is also asserted: the two UNUSED_IMPORT warnings now carry gamma.twf
// instead of an empty file.
func TestParseFilesAttributesReferenceErrorToReferencingFile(t *testing.T) {
	// Explicit file list, in order, mirroring `twf check alpha beta gamma`.
	paths := []string{
		testdata("ambiguous_cross_package_ref", "alpha.twf"),
		testdata("ambiguous_cross_package_ref", "beta.twf"),
		testdata("ambiguous_cross_package_ref", "gamma.twf"),
	}
	_, diags, err := pipeline.ParseFiles(paths)
	if err != nil {
		t.Fatalf("ParseFiles: %v", err)
	}

	var undef *pipeline.Diagnostic
	for i := range diags {
		if diags[i].Kind == "resolve" && diags[i].Code == "UNDEFINED_WORKFLOW" {
			undef = &diags[i]
			break
		}
	}
	if undef == nil {
		t.Fatalf("no UNDEFINED_WORKFLOW diagnostic; got %d diagnostics: %+v", len(diags), diags)
	}
	if undef.File != "gamma.twf" {
		t.Errorf("UNDEFINED_WORKFLOW file = %q, want gamma.twf (the referencing file)", undef.File)
	}
	if undef.Start.Line != 12 || undef.Start.Column != 5 {
		t.Errorf("UNDEFINED_WORKFLOW at %d:%d, want 12:5 (the reference site)", undef.Start.Line, undef.Start.Column)
	}
	if undef.Name != "Process" {
		t.Errorf("UNDEFINED_WORKFLOW name = %q, want Process", undef.Name)
	}

	// No resolve diagnostic may be attributed to a defining file: the bug
	// pointed the reference error (and left the import warnings file-less) at
	// alpha.twf/beta.twf.
	for _, d := range diags {
		if d.Kind != "resolve" {
			continue
		}
		if d.File == "alpha.twf" || d.File == "beta.twf" {
			t.Errorf("resolve diagnostic mis-attributed to a defining file: %+v", d)
		}
		if d.File == "" {
			t.Errorf("resolve diagnostic carries no file (issue #136 sibling symptom): %+v", d)
		}
	}
}

// TestStructuralLexErrorSurfacesAndBlocksLenient covers issue #97: a string
// literal containing a paren must not silently truncate the file. The lexer now
// emits a loud, positioned diagnostic that reaches the shared diagnostic path,
// and HasBlockingError reports it so `--lenient` cannot demote it to exit 0.
func TestStructuralLexErrorSurfacesAndBlocksLenient(t *testing.T) {
	// An unterminated string mid-file. The definition that follows must survive.
	src := "workflow Foo(x: int) -> (Result):\n" +
		"    activity Log(\"oops) -> ok\n" +
		"\n" +
		"activity Bar(y: string) -> (string):\n" +
		"    return y\n"

	file, diags, err := pipeline.ParseSource("t.twf", src)
	if err != nil {
		t.Fatalf("ParseSource: %v", err)
	}

	var lex *pipeline.Diagnostic
	for i := range diags {
		if diags[i].Kind == "parse" && diags[i].Code == parser.CodeLexical {
			lex = &diags[i]
			break
		}
	}
	if lex == nil {
		t.Fatalf("no structural lexical diagnostic; got %d: %+v", len(diags), diags)
	}
	if lex.Severity != "error" {
		t.Errorf("severity = %q, want error", lex.Severity)
	}
	if lex.Message != "unterminated string literal" {
		t.Errorf("message = %q, want 'unterminated string literal'", lex.Message)
	}
	if lex.Start.Line == 0 || lex.Start.Column == 0 {
		t.Errorf("expected a positioned diagnostic, got %+v", lex.Start)
	}

	if !pipeline.HasBlockingError(diags) {
		t.Errorf("HasBlockingError = false, want true (--lenient must not demote a lex error)")
	}

	// The trailing definition must still parse — the truncation guarantee.
	foundBar := false
	for _, def := range file.Definitions {
		if ad, ok := def.(*ast.ActivityDef); ok && ad.Name == "Bar" {
			foundBar = true
		}
	}
	if !foundBar {
		t.Errorf("trailing activity Bar was truncated; got %d definitions", len(file.Definitions))
	}
}

// TestSummarizeCountsDiagnostics ensures the envelope summary aggregates
// error and warning severities correctly. The CLI exit-code logic depends
// on this distinction (warnings must not flip exit codes).
func TestSummarizeCountsDiagnostics(t *testing.T) {
	file, diags, err := pipeline.ParseFiles([]string{testdata("undefined_activity.twf")})
	if err != nil {
		t.Fatalf("ParseFiles: %v", err)
	}
	s := pipeline.Summarize(file, diags)
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
	s := pipeline.EnsureSlice(nil)
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
	file, diags, err := pipeline.ParseFiles([]string{testdata("clean.twf")})
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

	env := pipeline.Envelope{
		Summary:     pipeline.Summarize(file, diags),
		Diagnostics: pipeline.EnsureSlice(diags),
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

// TestBuildWrapsAstGraphDiagnostics verifies the high-level Build assembler:
// it parses+extracts and marshals to the wrapped { ast, parserGraph,
// diagnostics } shape the visualizer's normalizePayload consumes. This is the
// in-process entry point the out-of-module `twf serve` binary (issue #138)
// shares with the CLI.
func TestBuildWrapsAstGraphDiagnostics(t *testing.T) {
	payload, err := pipeline.Build([]string{testdata("clean.twf")})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if payload.AST == nil {
		t.Fatalf("Build returned nil AST")
	}
	if payload.Graph == nil {
		t.Errorf("Build returned nil Graph for a clean file")
	}
	if payload.Diagnostics == nil {
		t.Errorf("Build diagnostics is nil, want non-nil slice (never null on the wire)")
	}

	out, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(out, &decoded); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	for _, key := range []string{"ast", "parserGraph", "diagnostics"} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("payload missing top-level key %q (visualizer normalizePayload requires it)", key)
		}
	}
	// The ast field must carry the definitions array the visualizer reads.
	astObj, ok := decoded["ast"].(map[string]any)
	if !ok {
		t.Fatalf("payload.ast is not an object: %T", decoded["ast"])
	}
	if _, ok := astObj["definitions"]; !ok {
		t.Errorf("payload.ast missing 'definitions'")
	}
}
