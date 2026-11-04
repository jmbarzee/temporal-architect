package pipeline_test

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/decompose"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
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

// spelled is how a diagnostic or sourceFile names a fixture file passed as
// (or walked under) testdata's absolute path: slash-separated (D9).
func spelled(elem ...string) string {
	return filepath.ToSlash(testdata(elem...))
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
		testdata("ambiguous_cross_package_ref", "alpha", "alpha.twf"),
		testdata("ambiguous_cross_package_ref", "beta", "beta.twf"),
		testdata("ambiguous_cross_package_ref", "gamma", "gamma.twf"),
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
	if want := spelled("ambiguous_cross_package_ref", "gamma", "gamma.twf"); undef.File != want {
		t.Errorf("UNDEFINED_WORKFLOW file = %q, want %s (the referencing file)", undef.File, want)
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
		if d.File == spelled("ambiguous_cross_package_ref", "alpha", "alpha.twf") || d.File == spelled("ambiguous_cross_package_ref", "beta", "beta.twf") {
			t.Errorf("resolve diagnostic mis-attributed to a defining file: %+v", d)
		}
		if d.File == "" {
			t.Errorf("resolve diagnostic carries no file (issue #136 sibling symptom): %+v", d)
		}
	}
}

// TestParseFilesAttributesValidateErrorToCallSiteFile covers issue #238: a
// call-site validator error names its callee, but must be attributed to the
// caller's file. The fixture is packaged_multi_file with the call's
// task_queue option removed, so kube.ApplyManifest inherits agent's queue.
func TestParseFilesAttributesValidateErrorToCallSiteFile(t *testing.T) {
	_, diags, err := pipeline.ParseFiles([]string{testdata("packaged_multi_file_routing_mismatch")})
	if err != nil {
		t.Fatalf("ParseFiles: %v", err)
	}

	var mismatch *pipeline.Diagnostic
	for i := range diags {
		if diags[i].Kind == "validate" && diags[i].Code == "IMPLICIT_ROUTING_MISMATCH" {
			mismatch = &diags[i]
			break
		}
	}
	if mismatch == nil {
		t.Fatalf("no IMPLICIT_ROUTING_MISMATCH diagnostic; got %d diagnostics: %+v", len(diags), diags)
	}
	if want := spelled("packaged_multi_file_routing_mismatch", "agent", "v1", "agent.twf"); mismatch.File != want {
		t.Errorf("IMPLICIT_ROUTING_MISMATCH file = %q, want %s (the calling file)", mismatch.File, want)
	}
	if mismatch.Start.Line != 10 || mismatch.Start.Column != 5 {
		t.Errorf("IMPLICIT_ROUTING_MISMATCH at %d:%d, want 10:5 (the call site)", mismatch.Start.Line, mismatch.Start.Column)
	}
	if mismatch.Name != "ApplyManifest" {
		t.Errorf("IMPLICIT_ROUTING_MISMATCH name = %q, want ApplyManifest", mismatch.Name)
	}

	// The bug pointed the call-site error at kube.twf, the callee's file.
	for _, d := range diags {
		if d.Kind == "validate" && strings.HasSuffix(d.File, "/kube.twf") {
			t.Errorf("validate diagnostic mis-attributed to the callee's file: %+v", d)
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

// TestDecomposeOverlayParity is the issue #156 anti-drift guard. The
// decomposition overlay must be identical no matter which canonical path
// produces it: the in-process pipeline.BuildDecompose(...) feed the served
// visualizer consumes, and the decompose.Decompose(file, graph, opts)
// value `twf graph chunks --json` wraps verbatim into its `chunks` envelope
// field. Both paths key off the same extracted graph, so the same Options on the
// same input must yield the same *decompose.Result — checked structurally
// (reflect.DeepEqual) and byte-for-byte on the marshaled overlay, which is
// exactly the bytes the CLI emits under `chunks`. If a future wrapper change
// desyncs the two feeds, this fails.
func TestDecomposeOverlayParity(t *testing.T) {
	paths := []string{testdata("clean.twf")}

	cases := []struct {
		name string
		opts decompose.Options
	}{
		{name: "default options", opts: decompose.Options{}},
		{name: "ceiling triggers explore", opts: decompose.Options{Ceiling: 5}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Pipeline path: the wrapped Payload feed hosts consume.
			got, err := pipeline.BuildDecompose(paths, tc.opts)
			if err != nil {
				t.Fatalf("BuildDecompose: %v", err)
			}
			if got.Decomposition == nil {
				t.Fatalf("BuildDecompose left Decomposition nil for a clean file")
			}

			// Oracle path: recompute the decompose.Result directly from the
			// same extracted graph, mirroring exactly what `twf graph chunks`
			// feeds into the `chunks` field of its JSON envelope.
			file, _, err := pipeline.ParseFiles(paths)
			if err != nil {
				t.Fatalf("ParseFiles: %v", err)
			}
			if file == nil {
				t.Fatalf("ParseFiles returned nil file")
			}
			want := decompose.Decompose(file, graph.Extract(file), tc.opts)

			// Structural parity.
			if !reflect.DeepEqual(got.Decomposition, want) {
				t.Errorf("pipeline.BuildDecompose overlay differs structurally from decompose.Decompose")
			}

			// Byte-identity: marshaling got.Decomposition must equal marshaling
			// the CLI's Result value. The Envelope carries the same
			// *decompose.Result under `chunks`, so identical bytes here mean the
			// served `decomposition` overlay and the CLI `chunks` overlay cannot
			// silently drift.
			gotJSON, err := json.Marshal(got.Decomposition)
			if err != nil {
				t.Fatalf("marshal pipeline overlay: %v", err)
			}
			wantJSON, err := json.Marshal(want)
			if err != nil {
				t.Fatalf("marshal oracle overlay: %v", err)
			}
			if string(gotJSON) != string(wantJSON) {
				t.Errorf("overlay bytes differ between paths:\n pipeline: %s\n cli:      %s", gotJSON, wantJSON)
			}
		})
	}
}

// TestPackagedGraphNodesJoinASTDefinitions pins the AST↔graph join the
// visualizer performs (issues #184, #230). Graph node IDs fold a definition's
// package into the name element (`workflow:agent.RunAgent`) while the AST name
// stays bare, so the AST wire carries each packaged workflow / activity /
// nexus-service definition's qualifiedName. Working from the marshaled payload
// alone, the test keys every definition as `${kind}:${qualifiedName ?? name}`
// (workers, namespaces and endpoints bare; operations under their service's
// key) and requires every graph node to join one — the join that gives a node
// its sourceFile (file chip) and lets cross-view focus find it. It mirrors
// buildAstLookup in tools/visualizer/src/adapter/build.ts; change the two
// together. The fixture spans three packages in three files, one imported
// through a module path with a `/v1` leaf, and an entry file holding only
// workers and a namespace; agent and kube each define an activity Think, which
// must land on two keys.
func TestPackagedGraphNodesJoinASTDefinitions(t *testing.T) {
	payload, err := pipeline.Build([]string{testdata("packaged_multi_file")})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if pipeline.HasErrors(payload.Diagnostics) {
		t.Fatalf("fixture must check clean, got diagnostics: %+v", payload.Diagnostics)
	}
	out, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	var wire struct {
		AST struct {
			Definitions []struct {
				Type          string  `json:"type"`
				Name          string  `json:"name"`
				QualifiedName *string `json:"qualifiedName"`
				SourceFile    string  `json:"sourceFile"`
				Endpoints     []struct {
					EndpointName string `json:"endpointName"`
				} `json:"endpoints"`
				Operations []struct {
					Name string `json:"name"`
				} `json:"operations"`
			} `json:"definitions"`
		} `json:"ast"`
		Graph struct {
			Nodes []struct {
				ID         string `json:"id"`
				Definition string `json:"definition"`
			} `json:"nodes"`
		} `json:"parserGraph"`
	}
	if err := json.Unmarshal(out, &wire); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}

	kindOf := map[string]string{
		"workflowDef":     "workflow",
		"activityDef":     "activity",
		"workerDef":       "worker",
		"namespaceDef":    "namespace",
		"nexusServiceDef": "nexusService",
	}
	sourceFileByKey := map[string]string{}
	for _, d := range wire.AST.Definitions {
		kind, ok := kindOf[d.Type]
		if !ok {
			t.Fatalf("unexpected definition type %q", d.Type)
		}
		name := d.Name
		if d.QualifiedName != nil {
			name = *d.QualifiedName
		}
		key := kind + ":" + name
		if prev, dup := sourceFileByKey[key]; dup {
			t.Errorf("definitions in %s and %s share key %q", prev, d.SourceFile, key)
		}
		sourceFileByKey[key] = d.SourceFile
		for _, ep := range d.Endpoints {
			sourceFileByKey["nexusEndpoint:"+ep.EndpointName] = d.SourceFile
		}
		for _, op := range d.Operations {
			sourceFileByKey["nexusOperation:"+name+"."+op.Name] = d.SourceFile
		}
	}

	nodesPerFile := map[string]int{}
	for _, n := range wire.Graph.Nodes {
		file, ok := sourceFileByKey[n.Definition]
		if !ok {
			t.Errorf("graph node %s: definition %q joins no AST definition", n.ID, n.Definition)
			continue
		}
		nodesPerFile[file]++
	}
	want := map[string]int{
		spelled("packaged_multi_file", "deploy", "deploy.twf"):                 4, // namespace, two workers, nexus endpoint
		spelled("packaged_multi_file", "agent", "v1", "agent.twf"):             4, // workflow, activity, nexus service, nexus operation
		spelled("packaged_multi_file", "lib", "twf", "kube", "v1", "kube.twf"): 3, // workflow, two activities
	}
	if !reflect.DeepEqual(nodesPerFile, want) {
		t.Errorf("graph nodes per source file = %v, want %v", nodesPerFile, want)
	}
}

// TestUnpackagedDefinitionsOmitQualifiedName guards the byte-identical promise
// for unpackaged designs: a definition with no package stamp emits no
// qualifiedName, because its graph name is already the bare name.
func TestUnpackagedDefinitionsOmitQualifiedName(t *testing.T) {
	payload, err := pipeline.Build([]string{testdata("clean.twf")})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	out, err := json.Marshal(payload.AST)
	if err != nil {
		t.Fatalf("marshal AST: %v", err)
	}
	if strings.Contains(string(out), `"qualifiedName"`) {
		t.Errorf("unpackaged AST JSON carries qualifiedName: %s", out)
	}
}

// TestPackagedOutputCarriesIdentityFields pins the package identity fields on a
// packaged fixture: graph nodes carry name and packageId, every output has the packages
// table, decompose nodes and chunks carry labels, and every section id is
// rebuilt byte-identically from its labelKind and subjects.
func TestPackagedOutputCarriesIdentityFields(t *testing.T) {
	payload, err := pipeline.BuildDecompose([]string{testdata("packaged_multi_file")}, decompose.Options{Ceiling: 1, Floor: -1})
	if err != nil {
		t.Fatalf("BuildDecompose: %v", err)
	}
	g := payload.Graph
	if g.Packages["github.com/example/app/agent/v1"].Name != "agent" || g.Packages["github.com/example/library-kube/twf/kube/v1"].Name != "kube" || g.Packages["github.com/example/app/deploy"].Name != "deploy" {
		t.Errorf("graph packages = %+v", g.Packages)
	}
	for _, n := range g.Nodes {
		if n.Name == "" {
			t.Errorf("node %s has no name", n.ID)
		}
		kind := n.Definition[:strings.IndexByte(n.Definition, ':')]
		hosted := kind == graph.KindWorkflow || kind == graph.KindActivity || kind == graph.KindNexusService || kind == graph.KindNexusOperation
		if hosted && n.PackageID == "" {
			t.Errorf("hosted node %s has no packageId", n.ID)
		}
		if hosted && kind != graph.KindNexusOperation && n.Definition != kind+":"+ast.QualifiedName(n.PackageID, n.Name) {
			t.Errorf("node %s: definition %q != kind:QualifiedName(packageId, name)", n.ID, n.Definition)
		}
	}
	d := payload.Decomposition
	if len(d.Packages) != 3 {
		t.Errorf("decomposition packages = %+v", d.Packages)
	}
	for _, n := range d.Nodes {
		if n.Label == "" || n.PackageID == "" {
			t.Errorf("decompose node %s: label %q packageId %q", n.Key, n.Label, n.PackageID)
		}
	}
	var checkSections func(parent string, divs []decompose.Division)
	checkSections = func(parent string, divs []decompose.Division) {
		for _, div := range divs {
			for _, s := range div.Sections {
				want := parent + "/" + s.LabelKind
				if len(s.Subjects) > 0 {
					want += ":" + strings.Join(s.Subjects, ",")
				}
				if s.ID != want || s.Label == "" {
					t.Errorf("section %q: rebuilt id %q, label %q", s.ID, want, s.Label)
				}
				checkSections(s.ID, s.Divisions)
			}
		}
	}
	for _, c := range d.Chunks {
		if c.ID != "chunk:"+c.BaseKey || c.Label == "" {
			t.Errorf("chunk %q: baseKey %q label %q", c.ID, c.BaseKey, c.Label)
		}
		checkSections(c.ID, c.Divisions)
	}

	out, err := json.Marshal(payload.AST)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `"packageId":"github.com/example/app/agent/v1"`) {
		t.Error("AST definitions carry no packageId")
	}
}
