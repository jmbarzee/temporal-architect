package observe

import (
	"reflect"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
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
