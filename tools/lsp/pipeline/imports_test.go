package pipeline_test

import (
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
		"top/top.twf": "package top\n\n" + topImports + "\nworkflow Main():\n" + topBody + "    close complete(\"ok\")\n",
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
	root := layout(t, importDesign(`import "example.com/demo/cluster/fabric/v1"`, "    workflow fabric.Provision()\n"))
	diags, _ := check(t, root)
	if len(diags) != 0 {
		t.Errorf("want a clean resolve, got %q", diags)
	}

	root = layout(t, importDesign(`import "example.com/demo/cluster/fabric/v1"`, "    workflow fabric.Setup()\n"))
	diags, _ = check(t, root)
	want := `top/top.twf:5:5 UNDEFINED_WORKFLOW: undefined workflow: fabric.Setup (package example.com/demo/cluster/fabric/v1)`
	if len(diags) != 1 || diags[0] != want {
		t.Errorf("diagnostics = %q, want [%q]", diags, want)
	}
}

func TestBothSameNamedPackagesWithAnAlias(t *testing.T) {
	root := layout(t, importDesign("import \"example.com/demo/fabric/v1\"\nimport cf \"example.com/demo/cluster/fabric/v1\"\n", "    workflow fabric.Setup()\n    workflow cf.Provision()\n"))
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
		{"one qualifier, two paths", "import \"example.com/demo/fabric/v1\"\nimport \"example.com/demo/cluster/fabric/v1\"", "    workflow fabric.Setup()\n",
			[]string{`top/top.twf:4:1 DUPLICATE_IMPORT_NAME: import name fabric is already bound to "example.com/demo/fabric/v1" in package top (top/top.twf:3); alias "example.com/demo/cluster/fabric/v1"`}},
		{"the same binding twice", "import \"example.com/demo/fabric/v1\"\nimport \"example.com/demo/fabric/v1\"", "    workflow fabric.Setup()\n", nil},
		{"typo under a known module", `import "example.com/demo/fabirc/v1"`, "    workflow fabirc.Setup()\n",
			[]string{`top/top.twf:3:1 IMPORT_NOT_FOUND: import "example.com/demo/fabirc/v1": module example.com/demo (at .) has no package fabirc/v1`}},
		{"case typo", `import "example.com/demo/Fabric/v1"`, "    workflow Fabric.Setup()\n",
			[]string{`top/top.twf:3:1 IMPORT_NOT_FOUND: import "example.com/demo/Fabric/v1": module example.com/demo (at .) has no package Fabric/v1; did you mean "example.com/demo/fabric/v1"?`}},
		{"outside every module", `import "github.com/elsewhere/pay"`, "    workflow pay.Charge()\n",
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
	files := importDesign(`import "example.com/demo/cluster/fabric/v1"`, "    workflow fabric.Provision()\n")
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
	// One path-less source: the import is external, never this package.
	res, err := pipeline.ParseSources(pipeline.Request{Virtual: []pipeline.Source{{Name: "input.twf", Content: sameLeaf}}})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(diagCodes(res), ","); got != "UNRESOLVED_IMPORT" {
		t.Errorf("diagnostics = %v, want only UNRESOLVED_IMPORT", res.Diagnostics)
	}
	if calledSetup(res) != nil {
		t.Error("cf.Setup resolved by name, to the source's own package")
	}

	// Two path-less sources, one named like the import's leaf: still external.
	other := "package fabric\n\nworkflow Setup():\n    close complete(\"ok\")\n"
	top := "package top\n\nimport \"example.com/demo/fabric\"\n\nworkflow Main():\n    workflow fabric.Setup()\n    close complete(\"ok\")\n"
	res, err = pipeline.ParseSources(pipeline.Request{Virtual: []pipeline.Source{{Name: "f.twf", Content: other}, {Name: "t.twf", Content: top}}})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(diagCodes(res), ","); !strings.Contains(got, "UNRESOLVED_IMPORT") {
		t.Errorf("a path-less package was imported by name: %v", res.Diagnostics)
	}

	// The module seam gives in-memory sources paths, and then they import by path.
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
