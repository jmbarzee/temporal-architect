package server

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// TestCallersSkipChangedLine: an allowed_caller_namespaces entry is indexed
// only while its analyzed line still holds that key, so text that changed on
// disk since analysis is never taken for one.
func TestCallersSkipChangedLine(t *testing.T) {
	ns := &ast.NamespaceDef{Name: "Shop"}
	ep := &ast.NamespaceEndpoint{Options: &ast.OptionsBlock{Entries: []*ast.OptionEntry{{
		Pos: ast.Pos{Line: 1, Column: 4},
		Key: "allowed_caller_namespaces",
	}}}}
	namespaces := map[string]*ast.NamespaceDef{"Shop": ns}
	for _, tt := range []struct {
		name string
		line string
		want int
	}{
		{"current", "\t\t\tallowed_caller_namespaces: [\"Shop\"]", 1},
		{"changed on disk", "\t\t\ttask_queue: \"Shop\"", 0},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var x indexer
			x.callers(ep, []string{tt.line}, namespaces)
			if len(x.out) != tt.want {
				t.Errorf("got %d occurrences, want %d: %+v", len(x.out), tt.want, x.out)
			}
		})
	}
}
