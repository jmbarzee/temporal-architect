package observe

import (
	"reflect"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

func TestMerge_UnionsPackages(t *testing.T) {
	a, b := New(), New()
	a.Packages = map[string]ast.PackageRef{"acme/orders": {Name: "orders"}}
	b.Packages = map[string]ast.PackageRef{"acme/billing": {Name: "billing"}}

	want := map[string]ast.PackageRef{"acme/orders": {Name: "orders"}, "acme/billing": {Name: "billing"}}
	if got := Merge(a, b).Packages; !reflect.DeepEqual(got, want) {
		t.Errorf("Packages = %v, want %v", got, want)
	}
	if got := Merge(New(), New()).Packages; got != nil {
		t.Errorf("Packages = %v, want none", got)
	}
}

func TestMerge_UnionsDiagnostics(t *testing.T) {
	shared := graph.Diagnostic{Severity: "warning", Code: "SIGNAL_TARGET_AMBIGUOUS", Message: "shared"}
	onlyB := graph.Diagnostic{Severity: "warning", Code: "SIGNAL_TARGET_AMBIGUOUS", Message: "only b"}
	a, b := New(), New()
	a.Diagnostics = []graph.Diagnostic{shared}
	b.Diagnostics = []graph.Diagnostic{shared, onlyB}

	got := Merge(a, b)
	if want := []graph.Diagnostic{shared, onlyB}; !reflect.DeepEqual(got.Diagnostics, want) {
		t.Errorf("Diagnostics = %v, want %v", got.Diagnostics, want)
	}
	if got.Summary.Diagnostics != 2 {
		t.Errorf("Summary.Diagnostics = %d, want 2", got.Summary.Diagnostics)
	}
}

func TestToGraph_CarriesPackages(t *testing.T) {
	o := New()
	o.Packages = map[string]ast.PackageRef{"acme/orders": {Name: "orders"}}
	if got := ToGraph(o).Packages; !reflect.DeepEqual(got, o.Packages) {
		t.Errorf("Packages = %v, want %v", got, o.Packages)
	}
}
