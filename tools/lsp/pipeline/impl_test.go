package pipeline_test

import (
	"path/filepath"
	"slices"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// implTWF annotates worker w with path, under the given package clause.
func implTWF(clause, path string) string {
	return clause + "@sdk(go, \"" + path + "\")\nworker w:\n\tactivity A\n\nactivity A():\n\treturn x\n"
}

// implNotFound lists the IMPL_NOT_FOUND diagnostics of res as "file severity",
// by the file's base name.
func implNotFound(res pipeline.Result) []string {
	var out []string
	for _, d := range res.Diagnostics {
		if d.Code == "IMPL_NOT_FOUND" {
			out = append(out, filepath.Base(d.Site.File)+" "+d.Severity)
		}
	}
	return out
}

// TestImplNotFound: an `@sdk` path is read from the module root, else from
// the .twf file's directory; one naming no file is a warning, and a source
// with no file is not checked.
func TestImplNotFound(t *testing.T) {
	tests := []struct {
		name  string
		files map[string]string // relative to the run's directory
		input string
		want  []string
	}{
		{"from the file's directory", map[string]string{
			"design/w.twf":       implTWF("", "cmd/main.go"),
			"design/cmd/main.go": "package main",
		}, "design", nil},
		{"up from the file's directory", map[string]string{
			"design/w.twf": implTWF("", "../cmd/main.go"),
			"cmd/main.go":  "package main",
		}, "design", nil},
		{"from the module root", map[string]string{
			"twf.mod":      "module acme\n",
			"design/w.twf": implTWF("package design\n\n", "cmd/main.go"),
			"cmd/main.go":  "package main",
		}, ".", nil},
		{"not from the directory inside a module", map[string]string{
			"twf.mod":            "module acme\n",
			"design/w.twf":       implTWF("package design\n\n", "cmd/main.go"),
			"design/cmd/main.go": "package main",
		}, ".", []string{"w.twf warning"}},
		{"a directory", map[string]string{
			"w.twf":       implTWF("", "cmd"),
			"cmd/main.go": "package main",
		}, ".", []string{"w.twf warning"}},
		{"missing", map[string]string{
			"w.twf": implTWF("", "cmd/main.go"),
		}, ".", []string{"w.twf warning"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tt.files {
				writeFile(t, filepath.Join(dir, filepath.FromSlash(name)), content)
			}
			res, err := pipeline.ParseSources(pipeline.Request{Inputs: []pipeline.Input{{Path: filepath.Join(dir, tt.input), Kind: pipeline.Tree}}})
			if err != nil {
				t.Fatalf("ParseSources: %v", err)
			}
			if got := implNotFound(res); !slices.Equal(got, tt.want) {
				t.Errorf("IMPL_NOT_FOUND = %v, want %v; all: %v", got, tt.want, codes(res))
			}
		})
	}

	res, err := pipeline.ParseSources(pipeline.Request{Virtual: []pipeline.Source{{Name: "w.twf", Content: implTWF("", "cmd/main.go")}}})
	if err != nil {
		t.Fatalf("ParseSources: %v", err)
	}
	if got := implNotFound(res); got != nil {
		t.Errorf("an inline source reported %v", got)
	}
}
