package server

import (
	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

func didOpenHandler(store *DocumentStore) protocol.TextDocumentDidOpenFunc {
	return func(context *glsp.Context, params *protocol.DidOpenTextDocumentParams) error {
		store.Open(params.TextDocument.URI, params.TextDocument.Text)
		return publishAll(context, store)
	}
}

func didChangeHandler(store *DocumentStore) protocol.TextDocumentDidChangeFunc {
	return func(context *glsp.Context, params *protocol.DidChangeTextDocumentParams) error {
		// Full sync: last content change has the full text.
		text := params.ContentChanges[len(params.ContentChanges)-1].(protocol.TextDocumentContentChangeEventWhole).Text
		store.Update(params.TextDocument.URI, text)
		return publishAll(context, store)
	}
}

func didCloseHandler(store *DocumentStore) protocol.TextDocumentDidCloseFunc {
	return func(context *glsp.Context, params *protocol.DidCloseTextDocumentParams) error {
		store.Close(params.TextDocument.URI)
		// Clear diagnostics for the closed document.
		context.Notify(protocol.ServerTextDocumentPublishDiagnostics, protocol.PublishDiagnosticsParams{
			URI:         params.TextDocument.URI,
			Diagnostics: []protocol.Diagnostic{},
		})
		return publishAll(context, store)
	}
}

// publishAll publishes every open document's diagnostics: one buffer's text
// can change another's.
func publishAll(context *glsp.Context, store *DocumentStore) error {
	for _, doc := range store.All() {
		if err := publishDiagnostics(context, doc); err != nil {
			return err
		}
	}
	return nil
}

func publishDiagnostics(context *glsp.Context, doc *Document) error {
	context.Notify(protocol.ServerTextDocumentPublishDiagnostics, protocol.PublishDiagnosticsParams{
		URI:         doc.URI,
		Diagnostics: diagnostics(doc),
	})
	return nil
}

// diagnostics is doc's parse, resolve and validate errors as LSP diagnostics.
func diagnostics(doc *Document) []protocol.Diagnostic {
	lines := doc.lines()
	diags := []protocol.Diagnostic{}
	for _, pe := range doc.ParseErrs {
		diags = appendDiag(diags, lines, pe.Line, pe.Column, "", pe.Code(), pe.Msg)
	}
	for _, re := range doc.ResolveErrs {
		diags = appendDiag(diags, lines, re.Line, re.Column, re.Severity, re.Code(), re.Msg)
	}
	for _, ve := range doc.ValidateErrs {
		diags = appendDiag(diags, lines, ve.Line, ve.Column, ve.Severity, ve.Code(), ve.Msg)
	}
	return diags
}

// appendDiag appends an LSP diagnostic with the parser's symbolic code in the
// LSP `Code` field. Editor clients can use it for hover-help routing,
// suppress-by-code workflows, and external rule documentation links.
func appendDiag(diags []protocol.Diagnostic, lines []string, line, column int, severity, code, msg string) []protocol.Diagnostic {
	sev := protocol.DiagnosticSeverityError
	switch severity {
	case "warning":
		sev = protocol.DiagnosticSeverityWarning
	case "hint":
		sev = protocol.DiagnosticSeverityHint
	}
	d := protocol.Diagnostic{
		Range:    posToRange(lines, line, column),
		Severity: ptrTo(sev),
		Source:   ptrTo("twf"),
		Message:  msg,
	}
	if code != "" {
		d.Code = &protocol.IntegerOrString{Value: code}
	}
	return append(diags, d)
}

// lineRange converts 1-based start/end lines to an LSP 0-based range spanning those lines.
func lineRange(startLine, endLine int) protocol.Range {
	s := uint32(0)
	if startLine > 0 {
		s = uint32(startLine - 1)
	}
	e := uint32(endLine)
	return protocol.Range{
		Start: protocol.Position{Line: s, Character: 0},
		End:   protocol.Position{Line: e, Character: 0},
	}
}
