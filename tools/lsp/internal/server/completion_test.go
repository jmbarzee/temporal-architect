package server

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
)

// TestCompletionListsDuplicateHandlerOnce: a signal or update declared twice
// (DUPLICATE_SIGNAL, DUPLICATE_UPDATE) is offered once.
func TestCompletionListsDuplicateHandlerOnce(t *testing.T) {
	file, err := parser.ParseFile(`workflow W():
	signal Ping():
		a = 1
	signal Ping(b: B):
		a = 2
	update Bump() -> (R):
		return r
	update Bump() -> (R):
		return r
	close complete()
`)
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, item := range workflowCompletions(file, file.Definitions[0].(*ast.WorkflowDef)) {
		if item.Detail != nil && (*item.Detail == "Signal" || *item.Detail == "Update") {
			counts[item.Label]++
		}
	}
	if counts["Ping"] != 1 || counts["Bump"] != 1 {
		t.Errorf("handler completions = %v, want Ping and Bump once each", counts)
	}
}
