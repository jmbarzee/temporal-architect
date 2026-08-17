package parser

import (
	"encoding/json"
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
