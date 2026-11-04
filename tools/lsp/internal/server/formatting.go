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
		edit, ok, err := indentEdit(doc.Content)
		if !ok {
			return nil, err
		}
		return []protocol.TextEdit{edit}, nil
	}
}

// indentEdit is the edit that rewrites content's indentation to tabs: the
// whole document, replaced with format.Indent of it. ok is false when the
// indentation is already tabs, or when its levels are unclear (err).
func indentEdit(content string) (edit protocol.TextEdit, ok bool, err error) {
	indented, err := format.Indent(content)
	if err != nil || indented == content {
		return protocol.TextEdit{}, false, err
	}
	return protocol.TextEdit{Range: documentRange(content), NewText: indented}, true, nil
}

// documentRange is the LSP range of all of content, its end placed as an LSP
// client counts lines: each "\r\n", "\n" or lone "\r" ends one.
func documentRange(content string) protocol.Range {
	var end protocol.Position
	last := 0
	for i := 0; i < len(content); i++ {
		switch {
		case content[i] == '\r' && i+1 < len(content) && content[i+1] == '\n':
			i++
			fallthrough
		case content[i] == '\n' || content[i] == '\r':
			end.Line++
			last = i + 1
		}
	}
	end.Character = utf16Len(content[last:])
	return protocol.Range{End: end}
}

// spaceIndented reports whether pe is the lexer's error for a space in a
// line's indentation.
func spaceIndented(pe *parser.ParseError) bool {
	return pe.Code() == parser.CodeLexical && strings.HasSuffix(pe.Msg, ".twf indents with tabs, one per level")
}
