package pipeline_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

const (
	callerTWF = `workflow Caller():
    workflow Callee() -> r
    close complete(r)
`
	calleeTWF = `workflow Callee():
    close complete("ok")
`
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func codes(res pipeline.Result) []string {
	var out []string
	for _, d := range res.Diagnostics {
		out = append(out, d.File+":"+d.Code)
	}
	return out
}

func hasCode(res pipeline.Result, file, code string) bool {
	for _, d := range res.Diagnostics {
		if d.File == file && d.Code == code {
			return true
		}
	}
	return false
}

func TestParseSourcesOverlayReplacesDisk(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "callee.twf"), calleeTWF)
	caller := filepath.Join(dir, "caller.twf")
	writeFile(t, caller, "workflow Caller():\n    close complete(\"stale\")\n")

	res, err := pipeline.ParseSources(pipeline.Request{
		Inputs:   []pipeline.Input{{Path: dir, Kind: pipeline.Tree}},
		Overlays: map[string]string{caller: callerTWF + "    activity Ghost()\n"},
	})
	if err != nil {
		t.Fatalf("ParseSources: %v", err)
	}
	if !hasCode(res, "caller.twf", "UNDEFINED_ACTIVITY") {
		t.Errorf("overlay text not analyzed; got %v", codes(res))
	}
}

func TestParseSourcesOverlayJoinsWalkWhenNotOnDisk(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "b_callee.twf"), calleeTWF)
	unsaved := filepath.Join(dir, "a_caller.twf")

	res, err := pipeline.ParseSources(pipeline.Request{
		Inputs:   []pipeline.Input{{Path: dir, Kind: pipeline.Tree}, {Path: unsaved, Kind: pipeline.File}},
		Overlays: map[string]string{unsaved: callerTWF},
	})
	if err != nil {
		t.Fatalf("ParseSources: %v", err)
	}
	if len(res.Diagnostics) != 0 {
		t.Errorf("want a clean merge, got %v", codes(res))
	}
	// Spliced at its lexical position, and parsed once although two inputs reach it.
	var names []string
	for _, def := range res.File.Definitions {
		names = append(names, def.(*ast.WorkflowDef).Name)
	}
	if got := strings.Join(names, ","); got != "Caller,Callee" {
		t.Errorf("definition order = %s, want Caller,Callee", got)
	}
}

func TestParseSourcesMissingTreeWithOverlay(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "not-yet")
	buf := filepath.Join(dir, "w.twf")

	res, err := pipeline.ParseSources(pipeline.Request{
		Inputs:   []pipeline.Input{{Path: dir, Kind: pipeline.Tree}},
		Overlays: map[string]string{buf: calleeTWF},
	})
	if err != nil {
		t.Fatalf("ParseSources: %v", err)
	}
	if len(res.File.Definitions) != 1 {
		t.Errorf("want the overlay's one definition, got %d", len(res.File.Definitions))
	}
}

func TestParseSourcesFileReachedTwiceParsesOnce(t *testing.T) {
	dir := t.TempDir()
	callee := filepath.Join(dir, "callee.twf")
	writeFile(t, callee, calleeTWF)

	res, err := pipeline.ParseSources(pipeline.Request{
		Inputs: []pipeline.Input{{Path: dir, Kind: pipeline.Tree}, {Path: callee, Kind: pipeline.File}},
	})
	if err != nil {
		t.Fatalf("ParseSources: %v", err)
	}
	if len(res.Diagnostics) != 0 {
		t.Errorf("a file reached twice must parse once; got %v", codes(res))
	}
}

func TestParseSourcesTypedErrorsCarryAttributedFile(t *testing.T) {
	res, err := pipeline.ParseSources(pipeline.Request{
		Virtual: []pipeline.Source{{Name: "solo.twf", Content: "workflow W():\n    activity Ghost()\n"}},
	})
	if err != nil {
		t.Fatalf("ParseSources: %v", err)
	}
	if len(res.ResolveErrs) == 0 {
		t.Fatal("want a resolve error")
	}
	for _, e := range res.ResolveErrs {
		if e.File != "solo.twf" {
			t.Errorf("ResolveError.File = %q, want solo.twf", e.File)
		}
	}
}

func TestParseSourcesRejectsBadRequests(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "w.twf")
	writeFile(t, file, calleeTWF)

	tests := []struct {
		name string
		req  pipeline.Request
		want string
	}{
		{"inputs and virtual", pipeline.Request{
			Inputs:  []pipeline.Input{{Path: file, Kind: pipeline.File}},
			Virtual: []pipeline.Source{{Content: calleeTWF}},
		}, "mutually exclusive"},
		{"file names a directory", pipeline.Request{Inputs: []pipeline.Input{{Path: dir, Kind: pipeline.File}}}, "is a directory"},
		{"tree names a file", pipeline.Request{Inputs: []pipeline.Input{{Path: file, Kind: pipeline.Tree}}}, "is not a directory"},
		{"missing file", pipeline.Request{Inputs: []pipeline.Input{{Path: filepath.Join(dir, "gone.twf"), Kind: pipeline.File}}}, "no such file"},
		{"empty tree", pipeline.Request{Inputs: []pipeline.Input{{Path: t.TempDir(), Kind: pipeline.Tree}}}, "no .twf files found"},
		{"nothing", pipeline.Request{}, "no input files"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := pipeline.ParseSources(tt.req)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("err = %v, want it to contain %q", err, tt.want)
			}
		})
	}
}
