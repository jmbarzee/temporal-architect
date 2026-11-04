package parser

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

const annotatedBody = "worker w:\n\tactivity A\n"

// TestWorkerSDKs: `@sdk` lines above a worker become its SDKs; a malformed or
// misplaced annotation is reported at its position and the definition kept.
func TestWorkerSDKs(t *testing.T) {
	tests := []struct {
		name  string
		above string
		want  []ast.WorkerSDK
		errs  []string // "line:col CODE"
	}{
		{"sdk and path", `@sdk(go, "cmd/w/main.go")`, []ast.WorkerSDK{
			{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "go", Impl: "cmd/w/main.go", ImplPos: ast.Pos{Line: 1, Column: 10}},
		}, nil},
		{"sdk alone, trailing comment", "@sdk(typescript)   # not yet written", []ast.WorkerSDK{
			{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "typescript"},
		}, nil},
		{"several, a comment line among them", "@sdk(go, \"../w.go\")\n# the TypeScript port\n@sdk(typescript)", []ast.WorkerSDK{
			{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "go", Impl: "../w.go", ImplPos: ast.Pos{Line: 1, Column: 10}},
			{Pos: ast.Pos{Line: 3, Column: 1}, SDK: "typescript"},
		}, nil},
		{"duplicate", "@sdk(go)\n@sdk(go)", []ast.WorkerSDK{{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "go"}}, []string{"2:1 DUPLICATE_SDK"}},
		{"unknown sdk", `@sdk(cobol, "x")`, nil, []string{"1:6 UNKNOWN_SDK"}},
		{"quoted sdk", `@sdk("go")`, nil, []string{"1:6 UNKNOWN_SDK"}},
		{"no sdk", `@sdk`, nil, []string{"1:2 UNKNOWN_SDK"}},
		{"unknown annotation", `@owner(payments)`, nil, []string{"1:1 UNKNOWN_ANNOTATION"}},
		{"keyword name", `@workflow`, nil, []string{"1:1 UNKNOWN_ANNOTATION"}},
		{"absolute path", `@sdk(go, "/srv/w.go")`, []ast.WorkerSDK{{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "go"}}, []string{"1:10 INVALID_IMPL_PATH"}},
		{"drive path", `@sdk(go, "c:/w.go")`, []ast.WorkerSDK{{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "go"}}, []string{"1:10 INVALID_IMPL_PATH"}},
		{"url", `@sdk(go, "https://example.com/w.go")`, []ast.WorkerSDK{{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "go"}}, []string{"1:10 INVALID_IMPL_PATH"}},
		{"backslash", `@sdk(go, "cmd\\w.go")`, []ast.WorkerSDK{{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "go"}}, []string{"1:10 INVALID_IMPL_PATH"}},
		{"empty path", `@sdk(go, "")`, []ast.WorkerSDK{{Pos: ast.Pos{Line: 1, Column: 1}, SDK: "go"}}, []string{"1:10 INVALID_IMPL_PATH"}},
		{"unquoted path", `@sdk(go, main)`, nil, []string{"1:10 SYNTAX"}},
		{"three args", `@sdk(go, "a", "b")`, nil, []string{"1:15 SYNTAX"}},
		{"empty args", `@sdk()`, nil, []string{"1:5 SYNTAX"}},
		{"trailing comma", `@sdk(go,)`, nil, []string{"1:8 SYNTAX"}},
		{"spaced name", `@ sdk(go)`, nil, []string{"1:3 SYNTAX"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, errs := ParseFileAll(tt.above + "\n" + annotatedBody)
			var got []string
			for _, e := range errs {
				got = append(got, fmt.Sprintf("%d:%d %s", e.Line, e.Column, e.Code()))
			}
			if !reflect.DeepEqual(got, tt.errs) {
				t.Errorf("errors = %v, want %v", got, tt.errs)
			}
			if len(file.Definitions) != 1 {
				t.Fatalf("definitions = %d, want the worker", len(file.Definitions))
			}
			if w := file.Definitions[0].(*ast.WorkerDef); !reflect.DeepEqual(w.SDKs, tt.want) {
				t.Errorf("SDKs = %+v, want %+v", w.SDKs, tt.want)
			}
		})
	}
}

// TestAnnotationMisplaced: an annotation sits directly above a top-level
// definition, with no blank line between, and `@sdk` above a worker only; the
// definitions around it are kept.
func TestAnnotationMisplaced(t *testing.T) {
	tests := []struct{ name, src, want string }{
		{"on a workflow", "@sdk(go)\nworkflow W():\n\tclose complete()\n", "1:1 ANNOTATION_MISPLACED"},
		{"on an activity", "@sdk(go)\nactivity A():\n\treturn x\n", "1:1 ANNOTATION_MISPLACED"},
		{"before an import", "@sdk(go)\nimport \"x/y\"\n", "1:1 ANNOTATION_MISPLACED"},
		{"at the end", annotatedBody + "@sdk(go)\n", "3:1 ANNOTATION_MISPLACED"},
		{"a blank line above the worker", "@sdk(go)\n\n" + annotatedBody, "1:1 ANNOTATION_MISPLACED"},
		{"a blank line above a comment", "@sdk(go)\n\n# note\n" + annotatedBody, "1:1 ANNOTATION_MISPLACED"},
		{"in a workflow body", "workflow W():\n\t@sdk(go)\n\tclose complete()\n", "2:2 ANNOTATION_MISPLACED"},
		{"in an activity body", "activity A():\n\t@sdk(go)\n\treturn x\n", "2:2 ANNOTATION_MISPLACED"},
		{"in a worker body", "worker w:\n\t@sdk(go)\n\tactivity A\n", "2:2 ANNOTATION_MISPLACED"},
		{"in a namespace body", "namespace n:\n\t@sdk(go)\n\tworker w\n", "2:2 ANNOTATION_MISPLACED"},
		{"in a nexus service body", "nexus service S:\n\t@sdk(go)\n\tasync Op workflow W\n", "2:2 ANNOTATION_MISPLACED"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, errs := ParseFileAll(tt.src)
			var got []string
			for _, e := range errs {
				got = append(got, fmt.Sprintf("%d:%d %s", e.Line, e.Column, e.Code()))
			}
			if len(got) != 1 || got[0] != tt.want {
				t.Errorf("errors = %v, want %s", got, tt.want)
			}
			for _, def := range file.Definitions {
				if w, ok := def.(*ast.WorkerDef); ok && len(w.SDKs) > 0 {
					t.Errorf("worker %s took a misplaced annotation: %+v", w.Name, w.SDKs)
				}
			}
		})
	}
}

// TestAnnotationRecovery: a definition that fails to parse stops before the
// next annotated one, which keeps its annotations.
func TestAnnotationRecovery(t *testing.T) {
	file, errs := ParseFileAll("worker v\n\n@sdk(go)\n" + annotatedBody)
	if len(errs) != 1 {
		t.Fatalf("errors = %v, want the one on worker v", errs)
	}
	w := file.Definitions[0].(*ast.WorkerDef)
	if len(w.SDKs) != 1 || w.SDKs[0].SDK != "go" {
		t.Errorf("worker %s SDKs = %+v, want go", w.Name, w.SDKs)
	}
}
