package server

import (
	"sort"

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
		return publishAll(context, store)
	}
}

// publishAll publishes every URI's diagnostics — one buffer's text can change
// another's, and an analysis publishes on other files too — then updates the
// watch on twf.mod files outside the workspace folders.
func publishAll(context *glsp.Context, store *DocumentStore) error {
	for _, p := range store.publications() {
		context.Notify(protocol.ServerTextDocumentPublishDiagnostics, p)
	}
	watchModuleFilesOutsideFolders(context, store)
	return nil
}

// publications returns what to publish. Each diagnostic belongs to a file: a
// buffer's own to the buffer's identity, its elsewhere ones to theirs. It is
// published under every open URI with that identity, else under the file's
// closed URI; a URI's set is the deduplicated union of every open buffer's
// contributions to it. Every open URI is published, and so is every URI
// published with diagnostics last time — with none, it is cleared.
func (s *DocumentStore) publications() []protocol.PublishDiagnosticsParams {
	s.mu.Lock()
	defer s.mu.Unlock()
	docs := s.all()
	sort.Slice(docs, func(i, j int) bool { return docs[i].URI < docs[j].URI })

	open := map[string][]string{} // identity → open URIs
	for _, d := range docs {
		if d.sourceFile != "" {
			open[d.sourceFile] = append(open[d.sourceFile], d.URI)
		}
	}
	type key struct {
		line, column            int
		severity, code, message string
	}
	sets := map[string][]protocol.Diagnostic{}
	seen := map[string]map[key]bool{}
	add := func(uris []string, line, column int, severity, code, msg string) {
		if severity == "" {
			severity = "error"
		}
		k := key{line, column, severity, code, msg}
		for _, uri := range uris {
			if seen[uri] == nil {
				seen[uri] = map[key]bool{}
			}
			if !seen[uri][k] {
				seen[uri][k] = true
				sets[uri] = appendDiag(sets[uri], line, column, severity, code, msg)
			}
		}
	}
	for _, d := range docs {
		own := []string{d.URI}
		if d.sourceFile != "" {
			own = open[d.sourceFile]
		}
		if sets[d.URI] == nil {
			sets[d.URI] = []protocol.Diagnostic{}
		}
		for _, e := range d.ParseErrs {
			add(own, e.Line, e.Column, "", e.Code(), e.Msg)
		}
		for _, e := range d.ResolveErrs {
			add(own, e.Line, e.Column, e.Severity, e.Code(), e.Msg)
		}
		for _, e := range d.ValidateErrs {
			add(own, e.Line, e.Column, e.Severity, e.Code(), e.Msg)
		}
		for _, x := range d.elsewhere {
			uris := open[x.File]
			if uris == nil {
				uris = []string{closedURI(s.folders, x.File)}
			}
			add(uris, x.Start.Line, x.Start.Column, x.Severity, x.Code, x.Message)
		}
	}

	for uri := range s.published {
		if _, ok := sets[uri]; !ok {
			sets[uri] = []protocol.Diagnostic{}
		}
	}
	s.published = map[string]bool{}
	out := make([]protocol.PublishDiagnosticsParams, 0, len(sets))
	for uri, diags := range sets {
		if len(diags) > 0 {
			s.published[uri] = true
		}
		out = append(out, protocol.PublishDiagnosticsParams{URI: uri, Diagnostics: diags})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].URI < out[j].URI })
	return out
}

// appendDiag appends an LSP diagnostic with the parser's symbolic code in the
// LSP `Code` field. Editor clients can use it for hover-help routing,
// suppress-by-code workflows, and external rule documentation links.
func appendDiag(diags []protocol.Diagnostic, line, column int, severity, code, msg string) []protocol.Diagnostic {
	sev := protocol.DiagnosticSeverityError
	switch severity {
	case "warning":
		sev = protocol.DiagnosticSeverityWarning
	case "hint":
		sev = protocol.DiagnosticSeverityHint
	}
	d := protocol.Diagnostic{
		Range:    posToRange(line, column),
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

// posToRange converts a 1-based parser position to an LSP 0-based range.
// We highlight the entire line since we don't have end positions.
func posToRange(line, column int) protocol.Range {
	l := uint32(0)
	if line > 0 {
		l = uint32(line - 1)
	}
	c := uint32(0)
	if column > 0 {
		c = uint32(column - 1)
	}
	return protocol.Range{
		Start: protocol.Position{Line: l, Character: c},
		End:   protocol.Position{Line: l, Character: c + 1000}, // highlight to end of line
	}
}
