package server

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// Document holds the content and analysis results for a single open file.
type Document struct {
	URI          string
	Content      string
	File         *ast.File
	ParseErrs    []*parser.ParseError
	ResolveErrs  []*resolver.ResolveError
	ValidateErrs []*validator.Error
	edited       int // the store's edit count at this document's last edit
}

// analyze parses, resolves, and validates the document content.
//
// doc.File stays the single-buffer AST with the buffer's own line numbers, and
// is always resolved in isolation so its Ref.Resolved pointers stay populated
// for the positional features (hover, definition, references, rename,
// signature-help, code-actions). doc.ParseErrs stay single-buffer (parse is
// intra-file).
//
// A `file:` buffer's doc.ResolveErrs and doc.ValidateErrs are those of
// pipeline.ParseSources over its home inputs — the deepest workspace folder
// whose walk reaches it, its directory, and the buffer itself — with every open
// buffer's text overlaid, filtered to the buffer's canonical identity: what
// `twf check <folder> <dir> <file>` would report once the buffers are saved.
// The merged AST is used only for diagnostics; it never becomes doc.File. If
// the inputs cannot be read, the buffer keeps its single-buffer diagnostics.
func (d *Document) analyze(folders []string, overlays map[string]string, runs map[string]analysis) {
	d.File = nil
	d.ParseErrs = nil
	d.ResolveErrs = nil
	d.ValidateErrs = nil

	f, errs := parser.ParseFileAll(d.Content)
	d.File = f
	d.ParseErrs = errs

	if len(f.Definitions) > 0 {
		d.ResolveErrs = resolver.Resolve(f)
		d.ValidateErrs = validator.Validate(f)
	}

	bufPath := uriToPath(d.URI)
	if bufPath == "" {
		return
	}
	canon := pipeline.Canonicalize(bufPath)
	var inputs []pipeline.Input
	if home := homeFolder(folders, canon); home != "" {
		inputs = append(inputs, pipeline.Input{Path: home, Kind: pipeline.Tree})
	}
	inputs = append(inputs, pipeline.Input{Path: filepath.Dir(canon), Kind: pipeline.Dir})
	// The directory reaches the buffer unless a walk skips its name; only then
	// does the buffer need its own input, so buffers of one directory share a run.
	if name := filepath.Base(canon); strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") || !strings.HasSuffix(name, ".twf") {
		inputs = append(inputs, pipeline.Input{Path: canon, Kind: pipeline.File})
	}

	key := fmt.Sprint(inputs)
	run, ok := runs[key]
	if !ok {
		run.res, run.err = pipeline.ParseSources(pipeline.Request{Inputs: inputs, Overlays: overlays, Mode: pipeline.Canonical})
		runs[key] = run
	}
	if run.err != nil {
		return
	}
	d.ResolveErrs, d.ValidateErrs = filterToBuffer(run.res, filepath.ToSlash(canon))
}

// analysis is one ParseSources run, shared by the buffers with its inputs.
type analysis struct {
	res pipeline.Result
	err error
}

// homeFolder is the deepest workspace folder whose walk reaches the buffer at
// canonical path canon, or "" when none does.
func homeFolder(folders []string, canon string) string {
	home := ""
	for _, f := range folders {
		c := pipeline.Canonicalize(f)
		if len(c) > len(home) && pipeline.InWalk(c, canon) {
			home = c
		}
	}
	return home
}

// DocumentStore is a thread-safe store of open documents.
type DocumentStore struct {
	mu   sync.RWMutex
	docs map[string]*Document
	// folders are the workspace folders' filesystem paths, captured at
	// `initialize`. Guarded by mu.
	folders []string
	// edits counts edits, so the most recently edited of two buffers with one
	// identity supplies its text. Guarded by mu.
	edits int
}

// SetFolders records the workspace folders' filesystem paths. Safe for
// concurrent use.
func (s *DocumentStore) SetFolders(paths []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.folders = paths
}

// NewDocumentStore creates an empty document store.
func NewDocumentStore() *DocumentStore {
	return &DocumentStore{
		docs: make(map[string]*Document),
	}
}

// Open adds or replaces a document in the store and re-analyzes every open
// document, since its text can change theirs.
func (s *DocumentStore) Open(uri, content string) *Document {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Opening is not an edit: a file already open under another URI keeps
	// that buffer's (possibly unsaved) text.
	doc := &Document{URI: uri, Content: content}
	s.docs[uri] = doc
	s.reanalyze()
	return doc
}

// Update updates the content of an existing document and re-analyzes every
// open document.
func (s *DocumentStore) Update(uri, content string) *Document {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, ok := s.docs[uri]
	if !ok {
		doc = &Document{URI: uri}
		s.docs[uri] = doc
	}
	doc.Content = content
	s.touch(doc)
	return doc
}

func (s *DocumentStore) touch(doc *Document) {
	s.edits++
	doc.edited = s.edits
	s.reanalyze()
}

// reanalyze analyzes every open document, overlaying every open `file:`
// buffer's text and sharing a run among documents with the same inputs.
func (s *DocumentStore) reanalyze() {
	docs := s.all()
	sort.Slice(docs, func(i, j int) bool {
		if docs[i].edited != docs[j].edited {
			return docs[i].edited < docs[j].edited
		}
		return docs[i].URI < docs[j].URI
	})
	overlays := map[string]string{}
	for _, d := range docs {
		if p := uriToPath(d.URI); p != "" {
			overlays[pipeline.Canonicalize(p)] = d.Content
		}
	}
	runs := map[string]analysis{}
	for _, d := range docs {
		d.analyze(s.folders, overlays, runs)
	}
}

// All returns every open document.
func (s *DocumentStore) All() []*Document {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.all()
}

func (s *DocumentStore) all() []*Document {
	out := make([]*Document, 0, len(s.docs))
	for _, d := range s.docs {
		out = append(out, d)
	}
	return out
}

// Get returns a document by URI.
func (s *DocumentStore) Get(uri string) (*Document, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	doc, ok := s.docs[uri]
	return doc, ok
}

// Close removes a document from the store and re-analyzes the rest, which now
// read its file from disk.
func (s *DocumentStore) Close(uri string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.docs, uri)
	s.reanalyze()
}
