package server

import (
	"fmt"
	"strings"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

func codeActionHandler(store *DocumentStore) protocol.TextDocumentCodeActionFunc {
	return func(context *glsp.Context, params *protocol.CodeActionParams) (any, error) {
		doc, ok := store.Get(params.TextDocument.URI)
		if !ok || doc.File == nil {
			return nil, nil
		}

		var actions []protocol.CodeAction

		// Collect all available code actions based on diagnostics and context
		actions = append(actions, addMissingDefinitionActions(doc, params)...)
		actions = append(actions, convertReturnToCloseActions(doc, params)...)
		actions = append(actions, createModuleFileActions(store, doc, params)...)
		actions = append(actions, convertIndentationActions(doc, params)...)

		// Return as interface slice for JSON encoding
		result := make([]any, len(actions))
		for i, a := range actions {
			result[i] = a
		}
		return result, nil
	}
}

// addMissingDefinitionActions creates code actions to add missing activity/workflow definitions
func addMissingDefinitionActions(doc *Document, params *protocol.CodeActionParams) []protocol.CodeAction {
	var actions []protocol.CodeAction

	// Check for undefined activity/workflow errors in the range
	lines := doc.lines()
	for _, err := range doc.ResolveErrs {
		errRange := posToRange(lines, err.Line, err.Column)
		if !rangesOverlap(params.Range, errRange) {
			continue
		}

		// A qualified reference's stub would land in this buffer's package,
		// not the one the qualifier names.
		if err.Qualifier != "" {
			continue
		}
		var name string
		var kind string
		switch err.Kind {
		case resolver.ErrUndefinedActivity:
			name = err.Name
			kind = "activity"
		case resolver.ErrUndefinedWorkflow:
			name = err.Name
			kind = "workflow"
		}

		if name != "" && kind != "" {
			params, result := callSignature(doc.File, err.Line, err.Column)
			returnType := ""
			if result != "" {
				returnType = "Result"
			}

			// Generate the definition
			var def string
			if kind == "activity" {
				if returnType != "" {
					def = fmt.Sprintf("\nactivity %s(%s) -> (%s):\n\t# TODO: implement\n\treturn result\n", name, params, returnType)
				} else {
					def = fmt.Sprintf("\nactivity %s(%s):\n\t# TODO: implement\n\treturn\n", name, params)
				}
			} else {
				if returnType != "" {
					def = fmt.Sprintf("\nworkflow %s(%s) -> (%s):\n\t# TODO: implement\n\tclose complete(result)\n", name, params, returnType)
				} else {
					def = fmt.Sprintf("\nworkflow %s(%s):\n\t# TODO: implement\n\tclose complete\n", name, params)
				}
			}

			def = strings.ReplaceAll(def, "\n", lineEnding(doc.Content))

			// Insert at end of file
			end := position(lines, len(lines), len(lines[len(lines)-1])+1)

			action := protocol.CodeAction{
				Title: fmt.Sprintf("Add missing %s '%s'", kind, name),
				Kind:  ptrTo(protocol.CodeActionKindQuickFix),
				Edit: &protocol.WorkspaceEdit{
					Changes: map[string][]protocol.TextEdit{
						doc.URI: {
							{
								Range:   protocol.Range{Start: end, End: end},
								NewText: def,
							},
						},
					},
				},
			}
			actions = append(actions, action)
		}
	}

	return actions
}

// convertIndentationActions offers, once, to rewrite the buffer's indentation
// to tabs when the range overlaps a space in some line's indentation.
func convertIndentationActions(doc *Document, params *protocol.CodeActionParams) []protocol.CodeAction {
	lines := doc.lines()
	for _, pe := range doc.ParseErrs {
		if !spaceIndented(pe) || !rangesOverlap(params.Range, posToRange(lines, pe.Line, pe.Column)) {
			continue
		}
		edit, ok, _ := indentEdit(doc.Content)
		if !ok {
			return nil
		}
		return []protocol.CodeAction{{
			Title:       "Convert indentation to tabs",
			Kind:        ptrTo(protocol.CodeActionKindQuickFix),
			IsPreferred: boolPtr(true),
			Edit: &protocol.WorkspaceEdit{
				Changes: map[string][]protocol.TextEdit{doc.URI: {edit}},
			},
		}}
	}
	return nil
}

// convertReturnToCloseActions offers, on a `return` in a workflow body (not a
// handler's), the `close complete` it means. The edit replaces the statement
// alone, so the line keeps its indentation and any comment after it.
func convertReturnToCloseActions(doc *Document, params *protocol.CodeActionParams) []protocol.CodeAction {
	lines := doc.lines()
	var actions []protocol.CodeAction
	for _, def := range doc.File.Definitions {
		wf, ok := def.(*ast.WorkflowDef)
		if !ok {
			continue
		}
		for _, ret := range findReturnStatements(wf.Body) {
			start, end := statementSpan(doc.Content, ret.Pos)
			span := protocol.Range{Start: offsetPosition(doc.Content, lines, start), End: offsetPosition(doc.Content, lines, end)}
			if !rangesOverlap(params.Range, span) {
				continue
			}
			// The value as the buffer spells it, so one over several lines
			// keeps the buffer's line endings.
			value := strings.TrimLeft(strings.TrimPrefix(doc.Content[start:end], "return"), " \t")
			actions = append(actions, protocol.CodeAction{
				Title: "Convert 'return' to 'close complete'",
				Kind:  ptrTo(protocol.CodeActionKindRefactor),
				Edit: &protocol.WorkspaceEdit{
					Changes: map[string][]protocol.TextEdit{
						doc.URI: {{Range: span, NewText: closeComplete(value)}},
					},
				},
			})
		}
	}
	return actions
}

// closeComplete is the `close complete` statement that returns value: its
// argument list, or none for a bare `return`.
func closeComplete(value string) string {
	switch toks := lexer.New(value).AllTokens(); {
	case value == "":
		return "close complete"
	case toks[0].Type == token.ARGS && toks[0].End == len(value):
		return "close complete" + value // already parenthesized: `return (a, b)`
	default:
		return "close complete(" + value + ")"
	}
}

// statementSpan is the byte span of the statement at pos in content: from
// its keyword to its last token, before any comment. An argument list may
// carry it onto later lines.
func statementSpan(content string, pos ast.Pos) (start, end int) {
	start = min(lineOffset(content, pos.Line)+max(pos.Column-1, 0), len(content))
	end = start
	for l := lexer.New(content[start:]); ; {
		tok := l.NextToken()
		switch tok.Type {
		case token.NEWLINE, token.COMMENT, token.TRAILING_COMMENT, token.INDENT, token.DEDENT, token.EOF:
			return start, end
		}
		end = start + tok.End
	}
}

// offsetPosition is the LSP position of byte offset off in content.
func offsetPosition(content string, lines []string, off int) protocol.Position {
	before := content[:off]
	return position(lines, strings.Count(before, "\n")+1, off-strings.LastIndex(before, "\n"))
}

// Helper functions

func rangesOverlap(a, b protocol.Range) bool {
	// Check if ranges overlap at all
	return !(a.End.Line < b.Start.Line || b.End.Line < a.Start.Line)
}

// callSignature returns the arguments and result binding of the call whose
// target reference stands at line:column, in any body of file: a direct
// activity or workflow call, or the target of a promise or await. A reference
// that is no call, such as a worker registration or a nexus operation's
// backing workflow, has neither.
func callSignature(file *ast.File, line, column int) (args, result string) {
	found := false
	match := func(ref ast.Pos, a, r string) bool {
		if ref.Line == line && ref.Column == column {
			args, result, found = a, r, true
		}
		return !found
	}
	visit := func(s ast.Statement) bool {
		switch s := s.(type) {
		case *ast.ActivityCall:
			return match(s.Activity.Pos, s.Args, s.Result)
		case *ast.WorkflowCall:
			return match(s.Workflow.Pos, s.Args, s.Result)
		}
		return true
	}
	target := ast.WithAsyncTargets(func(t ast.AsyncTarget, _ ast.Statement) bool {
		switch t := t.(type) {
		case *ast.ActivityTarget:
			return match(t.Activity.Pos, t.Args, t.Result)
		case *ast.WorkflowTarget:
			return match(t.Workflow.Pos, t.Args, t.Result)
		}
		return true
	})
	for _, body := range bodies(file) {
		if !ast.WalkStatements(body, visit, target) {
			break
		}
	}
	return args, result
}

// bodies returns every statement block of file's definitions: workflow
// bodies and their handlers', activity bodies, and sync nexus operations'.
func bodies(file *ast.File) [][]ast.Statement {
	var out [][]ast.Statement
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			out = append(out, d.Body)
			for _, s := range d.Signals {
				out = append(out, s.Body)
			}
			for _, q := range d.Queries {
				out = append(out, q.Body)
			}
			for _, u := range d.Updates {
				out = append(out, u.Body)
			}
		case *ast.ActivityDef:
			out = append(out, d.Body)
		case *ast.NexusServiceDef:
			for _, op := range d.Operations {
				out = append(out, op.Body)
			}
		}
	}
	return out
}

func findReturnStatements(stmts []ast.Statement) []*ast.ReturnStmt {
	var returns []*ast.ReturnStmt
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		if ret, ok := s.(*ast.ReturnStmt); ok {
			returns = append(returns, ret)
		}
		return true
	})
	return returns
}
