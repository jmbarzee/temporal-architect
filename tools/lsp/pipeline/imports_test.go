package pipeline_test

import (
	"encoding/json"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// importDesign is a module example.com/demo with two packages both named
// fabric — #232's repro — and a top package importing one of them.
func importDesign(topImports, topBody string) map[string]string {
	return map[string]string{
		"twf.mod": "module example.com/demo\n",
		"fabric/v1/f.twf": `package fabric

workflow Setup():
	close complete("ok")
`,
		"cluster/fabric/v1/c.twf": `package fabric

workflow Provision():
	close complete("ok")
`,
		"top/top.twf": "package top\n\n" + topImports + "\nworkflow Main():\n" + topBody + "\tclose complete(\"ok\")\n",
	}
}

func codesOf(diags []string) []string {
	var out []string
	for _, d := range diags {
		code := strings.Fields(d)[1]
		out = append(out, strings.TrimSuffix(code, ":"))
	}
	return out
}

func TestImportsBindByExactPath(t *testing.T) {
	// #232: the import names cluster/fabric/v1, and a bare leaf match would
	// pick the wrong fabric. By path, Provision resolves and Setup does not.
	root := layout(t, importDesign(`import "example.com/demo/cluster/fabric/v1"`, "\tworkflow fabric.Provision()\n"))
	diags, _ := check(t, root)
	if len(diags) != 0 {
		t.Errorf("want a clean resolve, got %q", diags)
	}

	root = layout(t, importDesign(`import "example.com/demo/cluster/fabric/v1"`, "\tworkflow fabric.Setup()\n"))
	diags, _ = check(t, root)
	want := `top/top.twf:5:18 UNDEFINED_WORKFLOW: undefined workflow: fabric.Setup (package example.com/demo/cluster/fabric/v1)`
	if len(diags) != 1 || diags[0] != want {
		t.Errorf("diagnostics = %q, want [%q]", diags, want)
	}
}

func TestBothSameNamedPackagesWithAnAlias(t *testing.T) {
	root := layout(t, importDesign("import \"example.com/demo/fabric/v1\"\nimport cf \"example.com/demo/cluster/fabric/v1\"\n", "\tworkflow fabric.Setup()\n\tworkflow cf.Provision()\n"))
	diags, _ := check(t, root)
	if len(diags) != 0 {
		t.Errorf("want a clean resolve, got %q", diags)
	}
}

func TestImportLineChecks(t *testing.T) {
	tests := []struct {
		name    string
		imports string
		body    string
		want    []string
	}{
		{"local path", `import "./fabric/v1"`, "", []string{`top/top.twf:3:1 INVALID_IMPORT_PATH: invalid import path "./fabric/v1": "./fabric/v1" is a local import path; use a module path such as "example.com/demo/…"`}},
		{"self import", `import "example.com/demo/top"`, "", []string{`top/top.twf:3:1 SELF_IMPORT: package example.com/demo/top imports itself`}},
		{"needs alias", `import "github.com/m/library-temporal-kube"`, "", []string{`top/top.twf:3:1 IMPORT_NEEDS_ALIAS: import "github.com/m/library-temporal-kube" needs an alias: its assumed name library-temporal-kube cannot be a package name`}},
		{"own name", `import "example.com/other/top"`, "", []string{`top/top.twf:3:1 DUPLICATE_IMPORT_NAME: import name top is this package's own name; alias "example.com/other/top"`}},
		{"one qualifier, two paths", "import \"example.com/demo/fabric/v1\"\nimport \"example.com/demo/cluster/fabric/v1\"", "\tworkflow fabric.Setup()\n",
			[]string{`top/top.twf:4:1 DUPLICATE_IMPORT_NAME: import name fabric is already bound to "example.com/demo/fabric/v1" in package top (top/top.twf:3); alias "example.com/demo/cluster/fabric/v1"`}},
		{"the same binding twice", "import \"example.com/demo/fabric/v1\"\nimport \"example.com/demo/fabric/v1\"", "\tworkflow fabric.Setup()\n", nil},
		{"typo under a known module", `import "example.com/demo/fabirc/v1"`, "\tworkflow fabirc.Setup()\n",
			[]string{`top/top.twf:3:1 IMPORT_NOT_FOUND: import "example.com/demo/fabirc/v1": module example.com/demo (at .) has no package fabirc/v1`}},
		{"case typo", `import "example.com/demo/Fabric/v1"`, "\tworkflow Fabric.Setup()\n",
			[]string{`top/top.twf:3:1 IMPORT_NOT_FOUND: import "example.com/demo/Fabric/v1": module example.com/demo (at .) has no package Fabric/v1; did you mean "example.com/demo/fabric/v1"?`}},
		{"outside every module", `import "github.com/elsewhere/pay"`, "\tworkflow pay.Charge()\n",
			[]string{`top/top.twf:3:1 UNRESOLVED_IMPORT: import "github.com/elsewhere/pay" is unresolved (no package "pay" in the tree); treated as external`}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := layout(t, importDesign(tt.imports, tt.body))
			diags, _ := check(t, root)
			if strings.Join(diags, "\n") != strings.Join(tt.want, "\n") {
				t.Errorf("diagnostics =\n%s\nwant\n%s", strings.Join(diags, "\n"), strings.Join(tt.want, "\n"))
			}
		})
	}
}

func TestImportNotLoadedAndSink(t *testing.T) {
	files := importDesign(`import "example.com/demo/cluster/fabric/v1"`, "\tworkflow fabric.Provision()\n")
	root := layout(t, files)
	// Only top is passed: the provider exists on disk but is not an input.
	t.Chdir(root)
	diags := runCheck(t, "top")
	want := `top/top.twf:3:1 IMPORT_NOT_LOADED: import "example.com/demo/cluster/fabric/v1" is not among the inputs; pass its package directory cluster/fabric/v1 (module example.com/demo); treated as external`
	if len(diags) != 1 || diags[0] != want {
		t.Errorf("diagnostics = %q, want [%q]", diags, want)
	}

	// The provider is passed but its only file is excluded: the import sinks
	// silently, and only the exclusion is reported.
	files["cluster/fabric/v1/c.twf"] = "package fabric\npackage again\n"
	root = layout(t, files)
	t.Chdir(root)
	diags = runCheck(t, ".")
	if got := strings.Join(codesOf(diags), ","); got != "SYNTAX" {
		t.Errorf("diagnostics = %q, want only the excluded file's parse error", diags)
	}
}

// TestExternalRegistrationsCompareByPath: two workers on one queue register
// one external workflow through two qualifiers for its import path; they hold
// the same types, so the queue is coherent.
func TestExternalRegistrationsCompareByPath(t *testing.T) {
	root := layout(t, map[string]string{
		"twf.mod": "module example.com/demo\n",
		"deploy/d.twf": `package deploy

import pay "github.com/ext/payments"
import payments "github.com/ext/payments"

worker wa:
	workflow pay.Charge

worker wb:
	workflow payments.Charge

namespace ns:
	worker wa
		options:
			task_queue: "q"
	worker wb
		options:
			task_queue: "q"
`,
	})
	t.Chdir(root)
	_, diags, err := pipeline.ParseFiles([]string{"."})
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range diags {
		if d.Code == "TASK_QUEUE_MISMATCH" {
			t.Errorf("aliases of one external path compared unequal: %+v", d)
		}
	}
}

// TestImportNotFoundAtEveryLine: a failed lookup is reported at each line that
// repeats it, so an editor showing either file sees why its references are quiet.
func TestImportNotFoundAtEveryLine(t *testing.T) {
	files := importDesign(`import "example.com/demo/fabirc/v1"`, "")
	files["top/b.twf"] = "package top\n\nimport \"example.com/demo/fabirc/v1\"\n"
	root := layout(t, files)
	diags, _ := check(t, root)
	if got := strings.Join(codesOf(diags), ","); got != "IMPORT_NOT_FOUND,IMPORT_NOT_FOUND" {
		t.Errorf("diagnostics = %q, want IMPORT_NOT_FOUND on both lines", diags)
	}
}

// sameLeaf is #232's confusion in one source: package fabric imports a
// different fabric by path and calls into it. By name the import would bind
// this package itself, and cf.Setup would resolve to its own Setup.
const sameLeaf = `package fabric

import cf "example.com/demo/cluster/fabric"

workflow Setup():
	workflow cf.Setup()
	close complete("ok")
`

func TestVirtualSourcesNeverBindByName(t *testing.T) {
	// The import is external, never this package.
	res, err := pipeline.ParseSources(pipeline.Request{Virtual: []pipeline.Source{{Name: "input.twf", Content: sameLeaf, Module: "example.com/demo", Dir: "fabric"}}})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(diagCodes(res), ","); got != "UNRESOLVED_IMPORT" {
		t.Errorf("diagnostics = %v, want only UNRESOLVED_IMPORT", res.Diagnostics)
	}
	if calledSetup(res) != nil {
		t.Error("cf.Setup resolved by name, to the source's own package")
	}

	// A package named like the import's leaf, at another path: still external.
	other := "package fabric\n\nworkflow Setup():\n\tclose complete(\"ok\")\n"
	top := "package top\n\nimport \"example.com/demo/fabric\"\n\nworkflow Main():\n\tworkflow fabric.Setup()\n\tclose complete(\"ok\")\n"
	res, err = pipeline.ParseSources(pipeline.Request{Virtual: []pipeline.Source{
		{Name: "f.twf", Content: other, Module: "example.com/demo", Dir: "other"},
		{Name: "t.twf", Content: top, Module: "example.com/demo", Dir: "top"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(diagCodes(res), ","); got != "UNRESOLVED_IMPORT" {
		t.Errorf("a package was imported by name: %v", res.Diagnostics)
	}

	// At the import's path, it binds.
	res, err = pipeline.ParseSources(pipeline.Request{Virtual: []pipeline.Source{
		{Name: "f.twf", Content: other, Module: "example.com/demo", Dir: "fabric"},
		{Name: "t.twf", Content: top, Module: "example.com/demo", Dir: "top"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Diagnostics) != 0 {
		t.Errorf("with paths, the import binds: %v", res.Diagnostics)
	}
	if _, err := pipeline.ParseSources(pipeline.Request{Virtual: []pipeline.Source{{Content: other, Module: "m"}, {Content: top}}}); err == nil {
		t.Error("sources in a module and in none must not share a run")
	}
}

// TestVirtualSourcesOutsideAModuleMatchFiles: in-memory sources in no module
// report what the same files on disk outside every module do (#308): a package
// clause is PACKAGE_OUTSIDE_MODULE and drops its file.
func TestVirtualSourcesOutsideAModuleMatchFiles(t *testing.T) {
	sources := []pipeline.Source{
		{Name: "a.twf", Content: "workflow A():\n\tactivity Ghost()\n"},
		{Name: "b.twf", Content: "package orders\n\nworkflow B():\n\tactivity Ghost()\n"},
		{Name: "c.twf", Content: sameLeaf},
	}
	dir := t.TempDir()
	t.Chdir(dir)
	var paths []string
	for _, s := range sources {
		writeFile(t, filepath.Join(dir, s.Name), s.Content)
		paths = append(paths, s.Name)
	}

	res, err := pipeline.ParseSources(pipeline.Request{Virtual: sources})
	if err != nil {
		t.Fatal(err)
	}
	file, diags, err := pipeline.ParseFiles(paths)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := json.Marshal(pipeline.Envelope{Summary: pipeline.Summarize(res.File, res.Diagnostics), Diagnostics: res.Diagnostics})
	want, _ := json.Marshal(pipeline.Envelope{Summary: pipeline.Summarize(file, diags), Diagnostics: diags})
	if string(got) != string(want) {
		t.Errorf("virtual sources:\n got: %s\nfiles: %s", got, want)
	}
	if got := strings.Join(diagCodes(res), ","); got != "UNDEFINED_ACTIVITY,PACKAGE_OUTSIDE_MODULE,PACKAGE_OUTSIDE_MODULE" {
		t.Errorf("codes = %s", got)
	}
}

func diagCodes(res pipeline.Result) []string {
	var out []string
	for _, d := range res.Diagnostics {
		out = append(out, d.Code)
	}
	return out
}

// calledSetup is what the first workflow's `workflow cf.Setup()` resolved to.
func calledSetup(res pipeline.Result) *ast.WorkflowDef {
	wf := res.File.Definitions[0].(*ast.WorkflowDef)
	return wf.Body[0].(*ast.WorkflowCall).Workflow.Resolved
}

// TestProviderLookup pins the provider lookup's edge cases (spec 15, Finding
// an Imported Package): top/ imports `q "<imp>"` and the run is given args.
func TestProviderLookup(t *testing.T) {
	const notFound = `top/top.twf:3:1 IMPORT_NOT_FOUND: import "example.com/demo/`
	tests := []struct {
		name  string
		imp   string
		files map[string]string
		links map[string]string // link → target, relative to the root
		args  []string
		want  []string
	}{
		{
			name:  "nested module declaring a shorter path",
			imp:   "example.com/demo/lib/x",
			files: map[string]string{"lib/twf.mod": "module example.com/demo\n", "lib/x/x.twf": wf("x", "X")},
			args:  []string{"top"},
			want:  []string{notFound + `lib/x": module example.com/demo (at .) has no package lib/x: the nested module at lib declares example.com/demo, which does not provide it (or pass the module that provides it)`},
		},
		{
			name:  "nested module declaring the path it sits at",
			imp:   "example.com/demo/lib/x",
			files: map[string]string{"lib/twf.mod": "module example.com/demo/lib\n", "lib/x/x.twf": wf("x", "X")},
			args:  []string{"top"},
			want:  []string{`top/top.twf:3:1 IMPORT_NOT_LOADED: import "example.com/demo/lib/x" is not among the inputs; pass its package directory lib/x (module example.com/demo/lib); treated as external`},
		},
		{
			// lib/twf.mod repeats the outer path with inputs on both sides: it
			// loses DUPLICATE_MODULE (app/ comes first), and the import sinks.
			name:  "nested module that lost DUPLICATE_MODULE",
			imp:   "example.com/demo/lib/x",
			files: map[string]string{"app/app.twf": wf("app", "App"), "lib/twf.mod": "module example.com/demo\n", "lib/x/x.twf": wf("x", "X")},
			args:  []string{"."},
			want:  []string{`lib/twf.mod:1:1 DUPLICATE_MODULE: module example.com/demo is also rooted at .; this copy is ignored`},
		},
		{
			name:  "symlinked directory mid-walk",
			imp:   "example.com/demo/vendor/lib/x",
			files: map[string]string{"vendor/keep.twf": wf("", "Keep"), "elsewhere/x/x.twf": wf("x", "X")},
			links: map[string]string{"vendor/lib": "elsewhere"},
			args:  []string{"top"},
			want:  []string{notFound + `vendor/lib/x": module example.com/demo (at .) has no package vendor/lib/x: lib is a symlinked directory (not followed)`},
		},
		{
			name:  "broken twf.mod with no inputs",
			imp:   "example.com/demo/lib/x",
			files: map[string]string{"lib/twf.mod": "modul example.com/demo/lib\n", "lib/x/x.twf": wf("x", "X")},
			args:  []string{"top"},
			want:  []string{notFound + `lib/x": module example.com/demo (at .) has no package lib/x: lib/twf.mod is broken`},
		},
		{
			name:  "broken twf.mod with inputs",
			imp:   "example.com/demo/lib/x",
			files: map[string]string{"lib/twf.mod": "modul example.com/demo/lib\n", "lib/x/x.twf": wf("x", "X")},
			args:  []string{"top", "lib"},
			want:  []string{`lib/twf.mod:1:1 MODULE_FILE_INVALID: unknown directive "modul"; expected "module <path>"`},
		},
		{
			name:  "case-only module match",
			imp:   "example.com/Demo/fabric",
			files: map[string]string{"fabric/f.twf": wf("fabric", "F")},
			args:  []string{"."},
			want:  []string{`top/top.twf:3:1 IMPORT_NOT_FOUND: import "example.com/Demo/fabric": module example.com/demo (at .): module path differs in case; did you mean "example.com/demo/fabric"?`},
		},
		{
			name: "case-only module match, no such package",
			imp:  "example.com/Demo/fabric",
			args: []string{"."},
			want: []string{`top/top.twf:3:1 IMPORT_NOT_FOUND: import "example.com/Demo/fabric": module example.com/demo (at .): module path differs in case`},
		},
		{
			// The only package file's package line is not its first clause: as an
			// input it is excluded at step 0, and the import sinks behind that.
			name:  "only package file excluded at step 0",
			imp:   "example.com/demo/fabric",
			files: map[string]string{"fabric/f.twf": wf("", "F") + "\npackage fabric\n"},
			args:  []string{"."},
			want:  []string{`fabric/f.twf:4:1 SYNTAX: package clause must be the file's first clause`},
		},
		{
			// Not an input, the same directory holds no package: the file's first
			// token is not `package`.
			name:  "only package file not first, not passed",
			imp:   "example.com/demo/fabric",
			files: map[string]string{"fabric/f.twf": wf("", "F") + "\npackage fabric\n"},
			args:  []string{"top"},
			want:  []string{notFound + `fabric": module example.com/demo (at .) has no package fabric: the directory holds no package`},
		},
		{
			// A failed first clause is still a package file: passed, step 0
			// excludes it and the import sinks; not passed, it provides.
			name:  "only package file a failed clause",
			imp:   "example.com/demo/fabric",
			files: map[string]string{"fabric/f.twf": "package 123\n\n" + wf("", "F")},
			args:  []string{"."},
			want:  []string{"fabric/f.twf:1:1 SYNTAX: expected a package name after package"},
		},
		{
			name:  "only package file a failed clause, not passed",
			imp:   "example.com/demo/fabric",
			files: map[string]string{"fabric/f.twf": "package 123\n\n" + wf("", "F")},
			args:  []string{"top"},
			want:  []string{`top/top.twf:3:1 IMPORT_NOT_LOADED: import "example.com/demo/fabric" is not among the inputs; pass its package directory fabric (module example.com/demo); treated as external`},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			files := map[string]string{
				"twf.mod":     "module example.com/demo\n",
				"top/top.twf": "package top\n\nimport q " + strconv.Quote(tt.imp) + "\n\nworkflow Main():\n\tworkflow q.W()\n\tclose complete(\"ok\")\n",
			}
			for k, v := range tt.files {
				files[k] = v
			}
			root := layout(t, files)
			for link, target := range tt.links {
				symlink(t, filepath.Join(root, filepath.FromSlash(target)), filepath.Join(root, filepath.FromSlash(link)))
			}
			t.Chdir(root)
			if diags := runCheck(t, tt.args...); strings.Join(diags, "\n") != strings.Join(tt.want, "\n") {
				t.Errorf("diagnostics =\n%s\nwant\n%s", strings.Join(diags, "\n"), strings.Join(tt.want, "\n"))
			}
		})
	}
}
