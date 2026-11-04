package pipeline_test

import (
	"strings"
	"testing"
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
