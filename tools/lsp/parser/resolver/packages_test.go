package resolver

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// TestOwnPackageQualifierResolves: a qualifier naming the file's own package
// behaves exactly like an unqualified same-package reference — it resolves.
func TestOwnPackageQualifierResolves(t *testing.T) {
	input := `package billing

activity Charge(amt) -> (ok):
    return ok

workflow Order(id):
    activity billing.Charge(id) -> done
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 0 {
		t.Fatalf("expected no resolve errors, got %v", errs)
	}
	wf := file.Definitions[1].(*ast.WorkflowDef)
	ac := wf.Body[0].(*ast.ActivityCall)
	if ac.Activity.Resolved == nil {
		t.Errorf("own-package-qualified activity ref was not resolved")
	}
}

// TestImportedPackageQualifierLeftUnresolved: a qualifier naming an imported
// package is recorded but left unresolved this slice — no cross-package lookup,
// no error (cross-package resolution is deferred to #109).
func TestImportedPackageQualifierLeftUnresolved(t *testing.T) {
	input := `package billing

import "acme/shared"

workflow Order(id):
    activity shared.Charge(id) -> done
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 0 {
		t.Fatalf("imported-package qualifier should produce no diagnostics, got %v", errs)
	}
	wf := file.Definitions[0].(*ast.WorkflowDef)
	ac := wf.Body[0].(*ast.ActivityCall)
	if ac.Activity.Resolved != nil {
		t.Errorf("imported-package activity ref should be left unresolved, got %v", ac.Activity.Resolved)
	}
}
