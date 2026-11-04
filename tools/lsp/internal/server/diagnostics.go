package server

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

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
// closed URI, with its range in that file's text; a URI's set is the
// deduplicated union of every open buffer's contributions to it. Every open
// URI is published, and so is every URI published with diagnostics last time
// — with none, it is cleared.
func (s *DocumentStore) publications() []protocol.PublishDiagnosticsParams {
	s.mu.Lock()
	defer s.mu.Unlock()
	docs := s.all()
	sort.Slice(docs, func(i, j int) bool { return docs[i].URI < docs[j].URI })

	// A file open under several URIs has one text, the most recently edited
	// buffer's (reanalyze's overlay order): that buffer supplies the file's own
	// diagnostics for all of them.
	open := map[string][]string{}     // identity → open URIs
	current := map[string]*Document{} // identity → the buffer whose text it is
	for _, d := range docs {
		if d.sourceFile != "" {
			open[d.sourceFile] = append(open[d.sourceFile], d.URI)
			if c := current[d.sourceFile]; c == nil || d.edited >= c.edited {
				current[d.sourceFile] = d
			}
		}
	}
	type key struct {
		rng           protocol.Range
		severity      protocol.DiagnosticSeverity
		code, message string
	}
	sets := map[string][]protocol.Diagnostic{}
	seen := map[string]map[key]bool{}
	add := func(uris []string, diag protocol.Diagnostic) {
		k := key{rng: diag.Range, severity: *diag.Severity, message: diag.Message}
		if diag.Code != nil {
			k.code = fmt.Sprint(diag.Code.Value)
		}
		for _, uri := range uris {
			if seen[uri] == nil {
				seen[uri] = map[key]bool{}
			}
			if !seen[uri][k] {
				seen[uri][k] = true
				sets[uri] = append(sets[uri], diag)
			}
		}
	}
	// The text each elsewhere diagnostic's position counts in: what the run
	// read, an open buffer's (overlaid) text or the file on disk, split into
	// lines without their `\r`.
	texts := map[string][]string{}
	linesOf := func(file string) []string {
		if lines, ok := texts[file]; ok {
			return lines
		}
		text, ok := s.overlays[filepath.FromSlash(file)]
		if !ok {
			b, _ := os.ReadFile(filepath.FromSlash(file))
			text = string(b)
		}
		lines := strings.Split(text, "\n")
		for i, l := range lines {
			lines[i] = strings.TrimSuffix(l, "\r")
		}
		texts[file] = lines
		return lines
	}
	for _, d := range docs {
		if sets[d.URI] == nil {
			sets[d.URI] = []protocol.Diagnostic{}
		}
		switch {
		case d.sourceFile == "":
			for _, diag := range diagnostics(d) {
				add([]string{d.URI}, diag)
			}
		case current[d.sourceFile] == d:
			for _, diag := range diagnostics(d) {
				add(open[d.sourceFile], diag)
			}
		}
		for _, x := range d.elsewhere {
			uris := open[x.File]
			if uris == nil {
				uris = []string{closedURI(s.folders, x.File)}
			}
			add(uris, appendDiag(nil, linesOf(x.File), x.Start.Line, x.Start.Column, x.Severity, x.Code, x.Message)[0])
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
