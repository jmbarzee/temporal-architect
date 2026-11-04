package server

import (
	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

func documentSymbolHandler(store *DocumentStore) protocol.TextDocumentDocumentSymbolFunc {
	return func(context *glsp.Context, params *protocol.DocumentSymbolParams) (any, error) {
		doc, ok := store.Get(params.TextDocument.URI)
		if !ok || doc.File == nil {
			return nil, nil
		}

		lines := doc.lines()
		var symbols []protocol.DocumentSymbol
		for _, def := range doc.File.Definitions {
			switch d := def.(type) {
			case *ast.WorkflowDef:
				symbols = append(symbols, workflowSymbol(lines, d))
			case *ast.ActivityDef:
				symbols = append(symbols, activitySymbol(lines, d))
			case *ast.WorkerDef:
				symbols = append(symbols, workerSymbol(lines, d))
			case *ast.NamespaceDef:
				symbols = append(symbols, namespaceSymbol(lines, d))
			case *ast.NexusServiceDef:
				symbols = append(symbols, nexusServiceSymbol(lines, d))
			}
		}

		return symbols, nil
	}
}

func workflowSymbol(lines []string, wf *ast.WorkflowDef) protocol.DocumentSymbol {
	r := defRange(wf)
	sym := protocol.DocumentSymbol{
		Name:           wf.Name,
		Kind:           protocol.SymbolKindFunction,
		Range:          r,
		SelectionRange: nameRange(lines, wf.NamePos, wf.Name),
	}

	var children []protocol.DocumentSymbol

	for _, s := range wf.Signals {
		endLine := lastLineInStmts(s.Body, s.Line)
		children = append(children, protocol.DocumentSymbol{
			Name:           s.Name,
			Kind:           protocol.SymbolKindEvent,
			Range:          lineRange(s.Line, endLine),
			SelectionRange: nameRange(lines, s.NamePos, s.Name),
		})
	}
	for _, q := range wf.Queries {
		endLine := lastLineInStmts(q.Body, q.Line)
		children = append(children, protocol.DocumentSymbol{
			Name:           q.Name,
			Kind:           protocol.SymbolKindMethod,
			Range:          lineRange(q.Line, endLine),
			SelectionRange: nameRange(lines, q.NamePos, q.Name),
		})
	}
	for _, u := range wf.Updates {
		endLine := lastLineInStmts(u.Body, u.Line)
		children = append(children, protocol.DocumentSymbol{
			Name:           u.Name,
			Kind:           protocol.SymbolKindMethod,
			Range:          lineRange(u.Line, endLine),
			SelectionRange: nameRange(lines, u.NamePos, u.Name),
		})
	}

	if len(children) > 0 {
		sym.Children = children
	}

	return sym
}

func activitySymbol(lines []string, act *ast.ActivityDef) protocol.DocumentSymbol {
	r := defRange(act)
	return protocol.DocumentSymbol{
		Name:           act.Name,
		Kind:           protocol.SymbolKindFunction,
		Range:          r,
		SelectionRange: nameRange(lines, act.NamePos, act.Name),
	}
}

func workerSymbol(lines []string, w *ast.WorkerDef) protocol.DocumentSymbol {
	// Estimate end line from the last ref.
	endLine := w.Line
	for _, ref := range w.Workflows {
		if ref.Line > endLine {
			endLine = ref.Line
		}
	}
	for _, ref := range w.Activities {
		if ref.Line > endLine {
			endLine = ref.Line
		}
	}
	for _, ref := range w.Services {
		if ref.Line > endLine {
			endLine = ref.Line
		}
	}

	sym := protocol.DocumentSymbol{
		Name:           w.Name,
		Kind:           protocol.SymbolKindModule,
		Range:          lineRange(w.Line, endLine),
		SelectionRange: nameRange(lines, w.NamePos, w.Name),
	}

	var children []protocol.DocumentSymbol
	for _, ref := range w.Workflows {
		children = append(children, protocol.DocumentSymbol{
			Name:           ref.Name,
			Kind:           protocol.SymbolKindFunction,
			Range:          lineRange(ref.Line, ref.Line),
			SelectionRange: nameRange(lines, ref.Pos, ref.Name),
		})
	}
	for _, ref := range w.Activities {
		children = append(children, protocol.DocumentSymbol{
			Name:           ref.Name,
			Kind:           protocol.SymbolKindFunction,
			Range:          lineRange(ref.Line, ref.Line),
			SelectionRange: nameRange(lines, ref.Pos, ref.Name),
		})
	}
	for _, ref := range w.Services {
		children = append(children, protocol.DocumentSymbol{
			Name:           ref.Name,
			Kind:           protocol.SymbolKindInterface,
			Range:          lineRange(ref.Line, ref.Line),
			SelectionRange: nameRange(lines, ref.Pos, ref.Name),
		})
	}
	if len(children) > 0 {
		sym.Children = children
	}
	return sym
}

func namespaceSymbol(lines []string, ns *ast.NamespaceDef) protocol.DocumentSymbol {
	endLine := ns.Line
	for _, w := range ns.Workers {
		if w.Line > endLine {
			endLine = w.Line
		}
	}
	for _, ep := range ns.Endpoints {
		if ep.Line > endLine {
			endLine = ep.Line
		}
	}

	sym := protocol.DocumentSymbol{
		Name:           ns.Name,
		Kind:           protocol.SymbolKindNamespace,
		Range:          lineRange(ns.Line, endLine),
		SelectionRange: nameRange(lines, ns.NamePos, ns.Name),
	}

	var children []protocol.DocumentSymbol
	for _, w := range ns.Workers {
		children = append(children, protocol.DocumentSymbol{
			Name:           w.Worker.Name,
			Kind:           protocol.SymbolKindModule,
			Range:          lineRange(w.Line, w.Line),
			SelectionRange: nameRange(lines, w.Worker.Pos, w.Worker.Name),
		})
	}
	for _, ep := range ns.Endpoints {
		children = append(children, protocol.DocumentSymbol{
			Name:           ep.EndpointName,
			Kind:           protocol.SymbolKindInterface,
			Range:          lineRange(ep.Line, ep.Line),
			SelectionRange: nameRange(lines, ep.NamePos, ep.EndpointName),
		})
	}
	if len(children) > 0 {
		sym.Children = children
	}
	return sym
}

func nexusServiceSymbol(lines []string, svc *ast.NexusServiceDef) protocol.DocumentSymbol {
	endLine := svc.Line
	for _, op := range svc.Operations {
		if op.Line > endLine {
			endLine = op.Line
		}
		endLine = lastLineInStmts(op.Body, endLine)
	}

	sym := protocol.DocumentSymbol{
		Name:           svc.Name,
		Kind:           protocol.SymbolKindInterface,
		Range:          lineRange(svc.Line, endLine),
		SelectionRange: nameRange(lines, svc.NamePos, svc.Name),
	}

	var children []protocol.DocumentSymbol
	for _, op := range svc.Operations {
		opEndLine := lastLineInStmts(op.Body, op.Line)
		children = append(children, protocol.DocumentSymbol{
			Name:           op.Name,
			Kind:           protocol.SymbolKindMethod,
			Range:          lineRange(op.Line, opEndLine),
			SelectionRange: nameRange(lines, op.NamePos, op.Name),
		})
	}
	if len(children) > 0 {
		sym.Children = children
	}
	return sym
}

// defRange estimates the full range of a definition by scanning its body
// statements for the last line number, since the AST does not store end positions.
func defRange(def ast.Definition) protocol.Range {
	startLine := def.NodeLine()
	endLine := startLine

	switch d := def.(type) {
	case *ast.WorkflowDef:
		endLine = lastLineInStmts(d.Body, endLine)
		for _, s := range d.Signals {
			if s.Line > endLine {
				endLine = s.Line
			}
			endLine = lastLineInStmts(s.Body, endLine)
		}
		for _, q := range d.Queries {
			if q.Line > endLine {
				endLine = q.Line
			}
			endLine = lastLineInStmts(q.Body, endLine)
		}
		for _, u := range d.Updates {
			if u.Line > endLine {
				endLine = u.Line
			}
			endLine = lastLineInStmts(u.Body, endLine)
		}
	case *ast.ActivityDef:
		endLine = lastLineInStmts(d.Body, endLine)
	}

	start := protocol.Position{}
	if startLine > 0 {
		start.Line = uint32(startLine - 1)
	}
	end := protocol.Position{Line: uint32(endLine), Character: 0} // line after the last statement

	return protocol.Range{Start: start, End: end}
}

func lastLineInStmts(stmts []ast.Statement, current int) int {
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		if s.NodeLine() > current {
			current = s.NodeLine()
		}
		return true
	})
	return current
}
