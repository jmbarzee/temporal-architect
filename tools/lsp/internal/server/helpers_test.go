package server

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
)

// mustParseWorkflowBody parses a workflow with the given body and returns
// the body statements.
func mustParseWorkflowBody(t *testing.T, body string) []ast.Statement {
	t.Helper()
	input := "workflow Test():\n" + body
	file, err := parser.ParseFile(input)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(file.Definitions) == 0 {
		t.Fatal("no definitions parsed")
	}
	wf, ok := file.Definitions[0].(*ast.WorkflowDef)
	if !ok {
		t.Fatalf("expected WorkflowDef, got %T", file.Definitions[0])
	}
	return wf.Body
}

func TestLastLineInStmts(t *testing.T) {
	body := mustParseWorkflowBody(t, "\tactivity Foo()\n\tactivity Bar()\n")
	result := lastLineInStmts(body, 0)
	if result != 3 {
		t.Errorf("expected last line 3, got %d", result)
	}
}

func TestLastLineInStmtsNested(t *testing.T) {
	body := mustParseWorkflowBody(t,
		"\tif (cond):\n"+
			"\t\tactivity Foo()\n"+
			"\t\tactivity Bar()\n")
	result := lastLineInStmts(body, 0)
	if result != 4 {
		t.Errorf("expected last line 4, got %d", result)
	}
}

func TestLastLineInStmtsEmpty(t *testing.T) {
	result := lastLineInStmts(nil, 5)
	if result != 5 {
		t.Errorf("expected 5 (unchanged), got %d", result)
	}
}

func TestFindNodeInStmts(t *testing.T) {
	body := mustParseWorkflowBody(t,
		"\tactivity Foo()\n"+
			"\tactivity Bar()\n")

	// Line 2 = "activity Foo()"
	node := findNodeInStmts(body, 2)
	if node == nil {
		t.Fatal("expected to find node at line 2")
	}
	call, ok := node.(*ast.ActivityCall)
	if !ok {
		t.Fatalf("expected ActivityCall, got %T", node)
	}
	if call.Activity.Name != "Foo" {
		t.Errorf("expected name 'Foo', got %q", call.Activity.Name)
	}

	// Line 3 = "activity Bar()"
	node = findNodeInStmts(body, 3)
	if node == nil {
		t.Fatal("expected to find node at line 3")
	}
	call, ok = node.(*ast.ActivityCall)
	if !ok {
		t.Fatalf("expected ActivityCall, got %T", node)
	}
	if call.Activity.Name != "Bar" {
		t.Errorf("expected name 'Bar', got %q", call.Activity.Name)
	}
}

func TestFindNodeInStmtsNested(t *testing.T) {
	body := mustParseWorkflowBody(t,
		"\tif (cond):\n"+
			"\t\tactivity Foo()\n")

	// Line 3 = "activity Foo()" inside the if body
	node := findNodeInStmts(body, 3)
	if node == nil {
		t.Fatal("expected to find node at line 3")
	}
	if _, ok := node.(*ast.ActivityCall); !ok {
		t.Fatalf("expected ActivityCall, got %T", node)
	}
}

func TestFindNodeInStmtsNotFound(t *testing.T) {
	body := mustParseWorkflowBody(t, "\tactivity Foo()\n")
	node := findNodeInStmts(body, 999)
	if node != nil {
		t.Errorf("expected nil for non-existent line, got %T", node)
	}
}

func TestFindReturnStatements(t *testing.T) {
	body := mustParseWorkflowBody(t,
		"\tif (cond):\n"+
			"\t\treturn x\n"+
			"\treturn y\n")

	returns := findReturnStatements(body)
	if len(returns) != 2 {
		t.Fatalf("expected 2 return statements, got %d", len(returns))
	}
}

func TestFindReturnStatementsNone(t *testing.T) {
	body := mustParseWorkflowBody(t, "\tactivity Foo()\n")
	returns := findReturnStatements(body)
	if len(returns) != 0 {
		t.Errorf("expected 0 return statements, got %d", len(returns))
	}
}
