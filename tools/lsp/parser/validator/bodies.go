package validator

import "github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"

// bodyStatements returns the statements of a body owner a flow graph holds: a
// workflow, a handler, an activity or a nexus operation.
func bodyStatements(owner ast.Node) []ast.Statement {
	switch o := owner.(type) {
	case *ast.WorkflowDef:
		return o.Body
	case *ast.SignalDecl:
		return o.Body
	case *ast.QueryDecl:
		return o.Body
	case *ast.UpdateDecl:
		return o.Body
	case *ast.ActivityDef:
		return o.Body
	case *ast.NexusOperation:
		return o.Body
	}
	return nil
}
