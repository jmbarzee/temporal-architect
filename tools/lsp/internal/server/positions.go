package server

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// The parser counts columns in bytes; LSP counts UTF-16 code units. Every
// position the server emits goes through position.

// position is the LSP position of a 1-based line and byte column in lines, the
// text of its file. A column past the end of the line clamps to the end.
func position(lines []string, line, column int) protocol.Position {
	text := lineText(lines, line)
	return protocol.Position{
		Line:      uint32(max(line-1, 0)),
		Character: utf16Len(text[:min(max(column-1, 0), len(text))]),
	}
}

// lineText is the 1-based line of lines without its terminator, or "" past the
// end.
func lineText(lines []string, line int) string {
	if line < 1 || line > len(lines) {
		return ""
	}
	return strings.TrimSuffix(lines[line-1], "\r")
}

// nameRange is the LSP range of name, spelled at pos in lines.
func nameRange(lines []string, pos ast.Pos, name string) protocol.Range {
	start := position(lines, pos.Line, pos.Column)
	end := start
	end.Character += utf16Len(name)
	return protocol.Range{Start: start, End: end}
}

// posToRange is the LSP range from a 1-based line and byte column in lines to
// the end of that line: where a diagnostic, which has no end, is drawn.
func posToRange(lines []string, line, column int) protocol.Range {
	start := position(lines, line, column)
	end := start
	end.Character = max(start.Character, utf16Len(lineText(lines, line)))
	return protocol.Range{Start: start, End: end}
}

// lines is the document's text, split into lines.
func (d *Document) lines() []string {
	return strings.Split(d.Content, "\n")
}

// spells reports whether lines still hold o's name at o's position.
func spells(lines []string, o occurrence) bool {
	if o.Line < 1 || o.Line > len(lines) || o.Column < 1 {
		return false
	}
	return strings.HasPrefix(lines[o.Line-1][min(o.Column-1, len(lines[o.Line-1])):], o.name)
}

// utf16Len is the length of s in UTF-16 code units.
func utf16Len(s string) uint32 {
	n := uint32(0)
	for _, r := range s {
		n++
		if r >= 0x10000 {
			n++
		}
	}
	return n
}

// sources maps the source files a positional request reaches to their URIs
// and lines: the requesting buffer, other open buffers, then the disk.
type sources struct {
	store *DocumentStore
	uri   string
	doc   *Document
	files map[string]source
}

type source struct {
	uri   string
	lines []string
}

func newSources(store *DocumentStore, uri string) *sources {
	doc, _ := store.Get(uri)
	return &sources{store: store, uri: uri, doc: doc, files: map[string]source{}}
}

// location is o's name in its file. ok is false when the file no longer spells
// the name there: a closed file the run read changed or went away since.
func (s *sources) location(o occurrence) (loc protocol.Location, ok bool) {
	src := s.open(o.file)
	return protocol.Location{URI: src.uri, Range: nameRange(src.lines, o.Pos, o.name)}, spells(src.lines, o)
}

// open returns the URI and lines of the source file spelled file.
func (s *sources) open(file string) source {
	if src, ok := s.files[file]; ok {
		return src
	}
	var src source
	switch {
	case s.doc != nil && file == s.doc.sourceFile:
		src = source{s.uri, s.doc.lines()}
	default:
		for _, d := range s.store.All() {
			if d.sourceFile != "" && d.sourceFile == file {
				src = source{d.URI, d.lines()}
			}
		}
		if src.uri == "" {
			src.uri = s.closedURI(file)
			if b, err := os.ReadFile(filepath.FromSlash(file)); err == nil {
				src.lines = strings.Split(string(b), "\n")
			}
		}
	}
	s.files[file] = src
	return src
}

// closedURI is the URI of a closed file, spelled through the deepest workspace
// folder it is under as the client spells that folder, not by its canonical
// path.
func (s *sources) closedURI(file string) string {
	uri, depth := pathToURI(file), -1
	for _, f := range s.store.Folders() {
		c := filepath.ToSlash(pipeline.Canonicalize(f))
		if rest, ok := strings.CutPrefix(file, c+"/"); ok && len(c) > depth {
			uri, depth = pathToURI(strings.TrimSuffix(filepath.ToSlash(f), "/")+"/"+rest), len(c)
		}
	}
	return uri
}

// pathToURI is the `file://` URI of a slash-separated absolute path.
func pathToURI(path string) string {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path // a Windows drive path, c:/x
	}
	return (&url.URL{Scheme: "file", Path: path}).String()
}
