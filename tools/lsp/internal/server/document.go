package server

import (
	"path/filepath"
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
}

// analyze parses, resolves, and validates the document content.
//
// doc.File stays the single-buffer AST with the buffer's own line numbers, and
// is always resolved in isolation so its Ref.Resolved pointers stay populated
// for the positional features (hover, definition, references, rename,
// signature-help, code-actions). doc.ParseErrs stay single-buffer (parse is
// intra-file).
//
// When a workspace root is set and the buffer has a filesystem path,
// doc.ResolveErrs and doc.ValidateErrs become the diagnostics of the merged
// `.twf` tree — pipeline.ParseSources over the root and the buffer, with the
// buffer's live text overlaid — filtered to the open buffer. The merged AST is
// used only for diagnostics; it never becomes doc.File. If the tree cannot be
// read, the buffer keeps its single-buffer diagnostics.
func (d *Document) analyze(root string) {
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

	if root == "" {
		return
	}
	bufAbs := uriToPath(d.URI)
	if bufAbs == "" {
		return
	}
	res, err := pipeline.ParseSources(pipeline.Request{
		Inputs: []pipeline.Input{
			{Path: root, Kind: pipeline.Tree},
			{Path: bufAbs, Kind: pipeline.File},
		},
		Overlays: map[string]string{bufAbs: d.Content},
	})
	if err != nil {
		return
	}
	d.ResolveErrs, d.ValidateErrs = filterToBuffer(res, filepath.Base(bufAbs))
}

// DocumentStore is a thread-safe store of open documents.
type DocumentStore struct {
	mu   sync.RWMutex
	docs map[string]*Document
	// root is the workspace root filesystem path captured at `initialize`
	// (empty when no workspace is open or the client sent no resolvable root).
	// When set, analyze resolves each open buffer against the merged `.twf`
	// tree under this path; when empty, every document falls back to
	// single-buffer analysis. Guarded by mu.
	root string
}

// SetRoot records the workspace root filesystem path. An empty path leaves
// documents in single-buffer mode. Safe for concurrent use.
func (s *DocumentStore) SetRoot(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.root = path
}

// NewDocumentStore creates an empty document store.
func NewDocumentStore() *DocumentStore {
	return &DocumentStore{
		docs: make(map[string]*Document),
	}
}

// Open adds or replaces a document in the store and analyzes it.
func (s *DocumentStore) Open(uri, content string) *Document {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc := &Document{URI: uri, Content: content}
	doc.analyze(s.root)
	s.docs[uri] = doc
	return doc
}

// Update updates the content of an existing document and re-analyzes it.
func (s *DocumentStore) Update(uri, content string) *Document {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, ok := s.docs[uri]
	if !ok {
		doc = &Document{URI: uri}
		s.docs[uri] = doc
	}
	doc.Content = content
	doc.analyze(s.root)
	return doc
}

// Get returns a document by URI.
func (s *DocumentStore) Get(uri string) (*Document, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	doc, ok := s.docs[uri]
	return doc, ok
}

// Close removes a document from the store.
func (s *DocumentStore) Close(uri string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.docs, uri)
}
