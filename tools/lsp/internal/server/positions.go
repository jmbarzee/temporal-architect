package server

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// nameRange is the LSP range of o's name in content, the text of o's file.
// The parser counts columns in bytes; LSP counts UTF-16 code units.
func nameRange(content string, o occurrence) protocol.Range {
	line := max(o.Line-1, 0)
	text := ""
	if lines := strings.Split(content, "\n"); line < len(lines) {
		text = lines[line]
	}
	start := utf16Len(text[:min(max(o.Column-1, 0), len(text))])
	return protocol.Range{
		Start: protocol.Position{Line: uint32(line), Character: start},
		End:   protocol.Position{Line: uint32(line), Character: start + utf16Len(o.name)},
	}
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
// and text: the requesting buffer, other open buffers, then the disk.
type sources struct {
	store *DocumentStore
	uri   string
	doc   *Document
	text  map[string]string
}

func newSources(store *DocumentStore, uri string) *sources {
	doc, _ := store.Get(uri)
	return &sources{store: store, uri: uri, doc: doc, text: map[string]string{}}
}

// location is o's name in its file.
func (s *sources) location(o occurrence) protocol.Location {
	uri, content := s.open(o.file)
	return protocol.Location{URI: uri, Range: nameRange(content, o)}
}

// open returns the URI and text of the source file spelled file.
func (s *sources) open(file string) (string, string) {
	if s.doc != nil && file == s.doc.sourceFile {
		return s.uri, s.doc.Content
	}
	for _, d := range s.store.All() {
		if d.sourceFile != "" && d.sourceFile == file {
			return d.URI, d.Content
		}
	}
	text, ok := s.text[file]
	if !ok {
		b, _ := os.ReadFile(filepath.FromSlash(file))
		text = string(b)
		s.text[file] = text
	}
	return pathToURI(file), text
}

// pathToURI is the `file://` URI of a slash-separated absolute path.
func pathToURI(path string) string {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path // a Windows drive path, c:/x
	}
	return (&url.URL{Scheme: "file", Path: path}).String()
}
