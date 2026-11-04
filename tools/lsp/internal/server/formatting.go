package server

import (
	"strings"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/format"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
)

// formattingHandler formats a buffer: its indentation, one tab per level.
// Tabs are the only style, so the request's options are ignored.
func formattingHandler(store *DocumentStore) protocol.TextDocumentFormattingFunc {
	return func(context *glsp.Context, params *protocol.DocumentFormattingParams) ([]protocol.TextEdit, error) {
		doc, ok := store.Get(params.TextDocument.URI)
		if !ok {
			return nil, nil
		}
		if edit, ok := indentEdit(doc.Content); ok {
			return []protocol.TextEdit{edit}, nil
		}
		return nil, nil
	}
}

// indentEdit is the edit that rewrites content's indentation to tabs: the
// whole document, replaced with format.Indent of it. ok is false when the
// indentation is already tabs.
func indentEdit(content string) (edit protocol.TextEdit, ok bool) {
	indented := format.Indent(content)
	if indented == content {
		return protocol.TextEdit{}, false
	}
	return protocol.TextEdit{Range: documentRange(content), NewText: indented}, true
}

// documentRange is the LSP range of all of content. Its end counts the last
// line whole, so a trailing `\r` that ends no line is inside it.
func documentRange(content string) protocol.Range {
	last := content[strings.LastIndexByte(content, '\n')+1:]
	return protocol.Range{End: protocol.Position{
		Line:      uint32(strings.Count(content, "\n")),
		Character: utf16Len(last),
	}}
}

// spaceIndented reports whether pe is the lexer's error for a space in a
// line's indentation.
func spaceIndented(pe *parser.ParseError) bool {
	return pe.Code() == parser.CodeLexical && strings.HasSuffix(pe.Msg, ".twf indents with tabs, one per level")
}
