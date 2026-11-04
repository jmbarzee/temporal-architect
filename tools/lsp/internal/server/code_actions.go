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
			// Find the call to extract parameters
			call := findCallByName(doc.File, name)
			params := ""
			returnType := ""
			if call != nil {
				params = call.Args
				if call.Result != "" {
					returnType = "Result"
				}
			}

			// Generate the definition
			var def string
			if kind == "activity" {
				if returnType != "" {
					def = fmt.Sprintf("\nactivity %s(%s) -> (%s):\n\t# TODO: implement\n\treturn result\n", name, params, returnType)
				} else {
					def = fmt.Sprintf("\nactivity %s(%s):\n\t# TODO: implement\n", name, params)
				}
			} else {
				if returnType != "" {
					def = fmt.Sprintf("\nworkflow %s(%s) -> (%s):\n\t# TODO: implement\n\tclose complete(result)\n", name, params, returnType)
				} else {
					def = fmt.Sprintf("\nworkflow %s(%s):\n\t# TODO: implement\n\tclose complete\n", name, params)
				}
			}

			def = strings.ReplaceAll(def, "\n\t", "\n"+indentUnit(lines))

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
			span := statementRange(doc.Content, lines, ret.Pos)
			if !rangesOverlap(params.Range, span) {
				continue
			}
			actions = append(actions, protocol.CodeAction{
				Title: "Convert 'return' to 'close complete'",
				Kind:  ptrTo(protocol.CodeActionKindRefactor),
				Edit: &protocol.WorkspaceEdit{
					Changes: map[string][]protocol.TextEdit{
						doc.URI: {{Range: span, NewText: closeComplete(ret.Value)}},
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

// statementRange is the range of the statement at pos in content,
// whose lines are lines: from its keyword to its last token, before any
// comment. An argument list may carry it onto later lines.
func statementRange(content string, lines []string, pos ast.Pos) protocol.Range {
	start := 0
	for _, l := range lines[:min(max(pos.Line-1, 0), len(lines))] {
		start += len(l) + 1
	}
	start = min(start+max(pos.Column-1, 0), len(content))
	end := start
	for l := lexer.New(content[start:]); ; {
		tok := l.NextToken()
		switch tok.Type {
		case token.NEWLINE, token.COMMENT, token.TRAILING_COMMENT, token.INDENT, token.DEDENT, token.EOF:
			return protocol.Range{Start: offsetPosition(content, lines, start), End: offsetPosition(content, lines, end)}
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

func findCallByName(file *ast.File, name string) *ast.ActivityCall {
	for _, def := range file.Definitions {
		if wf, ok := def.(*ast.WorkflowDef); ok {
			if call := findCallInStatements(wf.Body, name); call != nil {
				return call
			}
		}
	}
	return nil
}

func findCallInStatements(stmts []ast.Statement, name string) *ast.ActivityCall {
	var found *ast.ActivityCall
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		if call, ok := s.(*ast.ActivityCall); ok && call.Activity.Name == name {
			found = call
			return false
		}
		return true
	})
	return found
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

// indentUnit is the file's own indentation step: the leading whitespace of
// its first indented line, or a tab, the canonical style, when no line is
// indented.
func indentUnit(lines []string) string {
	for _, l := range lines {
		body := strings.TrimLeft(l, " \t")
		if body == "" || body == l || strings.HasPrefix(body, "#") {
			continue
		}
		return l[:len(l)-len(body)]
	}
	return "\t"
}
