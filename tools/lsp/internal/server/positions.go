package server

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// nameRange is the LSP range of o's name in lines, the text of o's file. The
// parser counts columns in bytes; LSP counts UTF-16 code units.
func nameRange(lines []string, o occurrence) protocol.Range {
	line := max(o.Line-1, 0)
	text := ""
	if line < len(lines) {
		text = lines[line]
	}
	start := utf16Len(text[:min(max(o.Column-1, 0), len(text))])
	return protocol.Range{
		Start: protocol.Position{Line: uint32(line), Character: start},
		End:   protocol.Position{Line: uint32(line), Character: start + utf16Len(o.name)},
	}
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
	return protocol.Location{URI: src.uri, Range: nameRange(src.lines, o)}, spells(src.lines, o)
}

// open returns the URI and lines of the source file spelled file.
func (s *sources) open(file string) source {
	if src, ok := s.files[file]; ok {
		return src
	}
	var src source
	switch {
	case s.doc != nil && file == s.doc.sourceFile:
		src = source{s.uri, strings.Split(s.doc.Content, "\n")}
	default:
		for _, d := range s.store.All() {
			if d.sourceFile != "" && d.sourceFile == file {
				src = source{d.URI, strings.Split(d.Content, "\n")}
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

func (s *sources) closedURI(file string) string {
	return closedURI(s.store.Folders(), file)
}

// closedURI is the URI of a closed file, spelled through the deepest workspace
// folder it is under as the client spells that folder, not by its canonical
// path.
func closedURI(folders []string, file string) string {
	uri, depth := pathToURI(file), -1
	for _, f := range folders {
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
