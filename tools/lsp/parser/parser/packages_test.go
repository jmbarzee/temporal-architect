package parser

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// TestPackageAndImports covers the new package clause + import declarations and
// the optional package qualifier on keyword-led call / registration positions.
// These are all additive: a clause-less file with no qualifiers parses exactly
// as before (covered by the rest of the parser suite).
func TestPackageAndImports(t *testing.T) {
	input := `package billing

import "acme/shared"
import legacy "acme/legacy"

activity Charge(amt) -> (ok):
	return ok

workflow Order(id):
	activity shared.Ship(id) -> done
	workflow billing.Sub(id) -> r

worker w:
	activity Charge
	workflow shared.Remote
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if file.Package != "billing" {
		t.Errorf("File.Package = %q, want %q", file.Package, "billing")
	}
	if len(file.Imports) != 2 {
		t.Fatalf("len(File.Imports) = %d, want 2", len(file.Imports))
	}
	if file.Imports[0].Path != "acme/shared" || file.Imports[0].Alias != "" {
		t.Errorf("Imports[0] = {Path:%q Alias:%q}, want {acme/shared ,}", file.Imports[0].Path, file.Imports[0].Alias)
	}
	if file.Imports[1].Path != "acme/legacy" || file.Imports[1].Alias != "legacy" {
		t.Errorf("Imports[1] = {Path:%q Alias:%q}, want {acme/legacy legacy}", file.Imports[1].Path, file.Imports[1].Alias)
	}

	// Order workflow body: qualified activity + workflow calls.
	var order *ast.WorkflowDef
	var worker *ast.WorkerDef
	for _, d := range file.Definitions {
		switch dd := d.(type) {
		case *ast.WorkflowDef:
			if dd.Name == "Order" {
				order = dd
			}
		case *ast.WorkerDef:
			worker = dd
		}
	}
	if order == nil {
		t.Fatal("Order workflow not found")
	}
	ac, ok := order.Body[0].(*ast.ActivityCall)
	if !ok {
		t.Fatalf("Order.Body[0] = %T, want *ast.ActivityCall", order.Body[0])
	}
	if ac.Activity.Package != "shared" || ac.Activity.Name != "Ship" {
		t.Errorf("activity ref = {Package:%q Name:%q}, want {shared Ship}", ac.Activity.Package, ac.Activity.Name)
	}
	wc, ok := order.Body[1].(*ast.WorkflowCall)
	if !ok {
		t.Fatalf("Order.Body[1] = %T, want *ast.WorkflowCall", order.Body[1])
	}
	if wc.Workflow.Package != "billing" || wc.Workflow.Name != "Sub" {
		t.Errorf("workflow ref = {Package:%q Name:%q}, want {billing Sub}", wc.Workflow.Package, wc.Workflow.Name)
	}

	// Worker registrations: unqualified activity, qualified workflow.
	if worker == nil {
		t.Fatal("worker not found")
	}
	if worker.Activities[0].Package != "" || worker.Activities[0].Name != "Charge" {
		t.Errorf("worker activity ref = {Package:%q Name:%q}, want {\"\" Charge}", worker.Activities[0].Package, worker.Activities[0].Name)
	}
	if worker.Workflows[0].Package != "shared" || worker.Workflows[0].Name != "Remote" {
		t.Errorf("worker workflow ref = {Package:%q Name:%q}, want {shared Remote}", worker.Workflows[0].Package, worker.Workflows[0].Name)
	}

	// JSON surfaces the new fields.
	data, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	js := string(data)
	for _, want := range []string{`"package":"billing"`, `"imports":[`, `"path":"acme/shared"`, `"alias":"legacy"`, `"package":"shared"`} {
		if !strings.Contains(js, want) {
			t.Errorf("File JSON missing %s\ngot: %s", want, js)
		}
	}
}

// TestUnqualifiedRefsEmitNoPackage guards the byte-identical invariant: a
// clause-less file with only unqualified references must emit no `package` key
// anywhere in its JSON (omitempty), so existing golden output is unchanged.
func TestUnqualifiedRefsEmitNoPackage(t *testing.T) {
	input := `activity Charge(amt) -> (ok):
	return ok

workflow Order(id):
	activity Charge(id) -> done

worker w:
	activity Charge
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(data), `"package"`) {
		t.Errorf("clause-less file emitted a package key: %s", data)
	}
	if strings.Contains(string(data), `"imports"`) {
		t.Errorf("clause-less file emitted an imports key: %s", data)
	}
}

// TestPackageClauseRules covers S1b's clause rules: one IDENT, first clause
// only, recovery from the token after `package`, and exclusion otherwise.
func TestPackageClauseRules(t *testing.T) {
	tests := []struct {
		name      string
		src       string
		pkg       string
		recovered bool
		excluded  bool
		errs      int
		imports   int
	}{
		{"plain", "package billing\nimport \"a/b\"\n", "billing", false, false, 0, 1},
		{"trailing comment", "package billing # main\n", "billing", false, false, 0, 0},
		{"comment and blank lines first", "# header\n\npackage billing\n", "billing", false, false, 0, 0},
		{"dotted name recovers its first element", "package a.b\nimport \"x/y\"\n", "a", true, false, 1, 1},
		{"keyword name recovers", "package nexus\nimport \"x/y\"\n", "nexus", true, false, 1, 1},
		{"no name excludes", "package\nimport \"x/y\"\n", "", false, true, 1, 1},
		{"string name excludes", "package \"x\"\n", "", false, true, 1, 0},
		{"duplicate excludes", "package a\npackage b\n", "a", false, true, 1, 0},
		{"not first excludes", "import \"x/y\"\npackage a\n", "", false, true, 1, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, errs := ParseFileAll(tt.src)
			if file.Package != tt.pkg || file.PackageRecovered != tt.recovered || file.ClauseExcluded != tt.excluded {
				t.Errorf("Package=%q recovered=%v excluded=%v, want %q %v %v", file.Package, file.PackageRecovered, file.ClauseExcluded, tt.pkg, tt.recovered, tt.excluded)
			}
			if len(errs) != tt.errs {
				t.Errorf("errors = %v, want %d", errs, tt.errs)
			}
			if len(file.Imports) != tt.imports {
				t.Errorf("imports = %d, want %d (a failed clause must not swallow the next lines)", len(file.Imports), tt.imports)
			}
		})
	}
}

// TestSoftKeywordsAsPackageNames: names that lex as IDENT are valid package
// names and qualifiers.
func TestSoftKeywordsAsPackageNames(t *testing.T) {
	for _, name := range []string{"service", "endpoint", "id", "run_id", "default_options", "parent"} {
		src := "package " + name + "\n\nworkflow W():\n\tworkflow " + name + ".Other() -> r\n\tclose complete(r)\n"
		file, errs := ParseFileAll(src)
		if len(errs) != 0 || file.Package != name {
			t.Errorf("package %s: Package=%q errs=%v", name, file.Package, errs)
			continue
		}
		wf := file.Definitions[0].(*ast.WorkflowDef)
		if wc, ok := wf.Body[0].(*ast.WorkflowCall); !ok || wc.Workflow.Package != name {
			t.Errorf("qualifier %s: body = %#v", name, wf.Body[0])
		}
	}
}

// TestClauseSurvivesALeadingBOMOrIndentedComment: neither is text before the
// clause, so the clause is still first and is never skipped by recovery.
func TestClauseSurvivesALeadingBOMOrIndentedComment(t *testing.T) {
	for name, src := range map[string]string{
		"BOM":              "\ufeffpackage billing\n",
		"indented comment": "\t# note\npackage billing\n",
	} {
		file, _ := ParseFileAll(src)
		if file.Package != "billing" || file.ClauseExcluded {
			t.Errorf("%s: Package=%q excluded=%v, want billing kept", name, file.Package, file.ClauseExcluded)
		}
	}
}

// TestImportPlacement: imports follow the package clause and precede every
// definition. An import after a definition is a parse error, and still binds
// so references through it do not cascade (#299).
func TestImportPlacement(t *testing.T) {
	const (
		wf  = "workflow W(x):\n\tclose complete(x)\n"
		act = "activity A(x):\n\treturn x\n"
		imp = "import \"a/b\"\n"
		ali = "import c \"c/d\"\n"
	)
	tests := []struct {
		name, src string
		errs      []string // line and message of each error
	}{
		{"imports before definitions", imp + ali + wf, nil},
		{"imports after the package clause", "package p\n\n" + imp + "# note\n" + ali + wf, nil},
		{"import after a workflow", wf + imp, []string{"3 import must come before the file's definitions"}},
		{"import after an activity", act + imp, []string{"3 import must come before the file's definitions"}},
		{"import after a worker", "worker w:\n\tworkflow W\n" + imp, []string{"3 import must come before the file's definitions"}},
		{"import after a namespace", "namespace ns:\n\tworker w\n\t\toptions:\n\t\t\ttask_queue: \"q\"\n" + imp,
			[]string{"5 import must come before the file's definitions"}},
		{"import after a nexus service", "nexus service S:\n\tasync Op workflow W\n" + imp, []string{"3 import must come before the file's definitions"}},
		{"import after a definition that fails", "workflow W(x)\n" + imp,
			[]string{"1 definition requires ':' and an indented body", "2 import must come before the file's definitions"}},
		{"import between definitions", imp + act + ali + wf, []string{"4 import must come before the file's definitions"}},
		{"several imports after a definition", act + imp + ali,
			[]string{"3 import must come before the file's definitions", "4 import must come before the file's definitions"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, errs := ParseFileAll(tt.src)
			var got []string
			for _, e := range errs {
				got = append(got, fmt.Sprintf("%d %s", e.Line, e.Msg))
			}
			if !reflect.DeepEqual(got, tt.errs) {
				t.Errorf("errors = %q, want %q", got, tt.errs)
			}
			if want := strings.Count(tt.src, "import "); len(file.Imports) != want {
				t.Errorf("imports = %d, want %d", len(file.Imports), want)
			}
			if _, err := ParseFile(tt.src); (err != nil) != (tt.errs != nil) {
				t.Errorf("ParseFile error = %v, want one: %v", err, tt.errs != nil)
			}
		})
	}
}
