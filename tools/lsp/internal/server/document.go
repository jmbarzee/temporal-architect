package server

import (
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
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

	// sourceFile is how the buffer's definitions spell their SourceFile: its
	// canonical path, or "" without one.
	sourceFile string
	// run is the merged AST of the buffer's workspace run, nil without one.
	// References, rename and definition use it to reach other files.
	run *ast.File
	// elsewhere are the run's diagnostics this buffer's analysis publishes on
	// other files (see moduleDiagnostics).
	elsewhere []pipeline.Diagnostic
}

// analyze parses, resolves, and validates the document content.
//
// doc.File stays the single-buffer AST with the buffer's own line numbers, and
// is always resolved in isolation so its Ref.Resolved pointers stay populated
// for the positional features (hover, signature-help, code-actions, and
// definition, references and rename when there is no run). doc.ParseErrs stay
// single-buffer (parse is intra-file).
//
// A `file:` buffer's doc.ResolveErrs and doc.ValidateErrs are those of
// pipeline.ParseSources over its home inputs — its module root, the deepest
// workspace folder whose walk reaches it, its directory, and the buffer itself
// when that walk skips its name — with every open buffer's text overlaid,
// filtered to the buffer's canonical identity: what `twf check <module root>
// <folder> <dir> <file>` would report once the buffers are saved. A buffer
// whose whole module is excluded also gets that module's error at its 1:1.
// What the run reports on other files that explains the buffer's is kept as
// doc.elsewhere. The merged AST never becomes doc.File; it is kept as doc.run.
// If the inputs cannot be read, the buffer keeps its single-buffer diagnostics.
//
// A buffer with no file is checked alone, as an MCP inline source is: outside
// every module, so a package clause is PACKAGE_OUTSIDE_MODULE and drops it.
func (d *Document) analyze(folders []string, overlays map[string]string, runs map[string]analysis) {
	d.File = nil
	d.run = nil
	d.elsewhere = nil
	d.sourceFile = ""
	d.ParseErrs = nil
	d.ResolveErrs = nil
	d.ValidateErrs = nil

	f, errs := parser.ParseFileAll(d.Content)
	d.File = f
	d.ParseErrs = errs

	// The isolated AST is stamped as the merged run stamps it: a `file:`
	// buffer in a module gets its package's import path, so even resolved
	// alone it binds imports only by path.
	bufPath := uriToPath(d.URI)
	var canon, modRoot string
	in := ast.StampInput{File: f}
	if bufPath != "" {
		canon = pipeline.Canonicalize(bufPath)
		d.sourceFile = filepath.ToSlash(canon)
		in.SourceFile = d.sourceFile
		var modPath string
		var err error
		modRoot, modPath, err = pipeline.ModuleOf(filepath.Dir(canon))
		if modRoot != "" && err == nil {
			in.Module = modPath
			if rel, err := filepath.Rel(modRoot, filepath.Dir(canon)); err == nil && rel != "." {
				in.Dir = filepath.ToSlash(rel)
			}
		}
	}
	isolated := ast.Stamp([]ast.StampInput{in})
	if len(f.Definitions) > 0 {
		d.ResolveErrs = resolver.Resolve(isolated)
		d.ValidateErrs = validator.Validate(isolated)
	}

	if bufPath == "" {
		if res, err := pipeline.ParseSources(pipeline.Request{Virtual: []pipeline.Source{{Name: "input.twf", Content: d.Content}}}); err == nil {
			d.ResolveErrs, d.ValidateErrs = res.ResolveErrs, res.ValidateErrs
		}
		return
	}
	var inputs []pipeline.Input
	if modRoot != "" {
		inputs = append(inputs, pipeline.Input{Path: modRoot, Kind: pipeline.Tree})
	}
	home := homeFolder(folders, canon)
	if home != "" && home != modRoot {
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
		if run.err == nil {
			editorHints(run.res, folders)
		}
		runs[key] = run
	}
	if run.err != nil {
		return
	}
	d.run = run.res.File
	d.ResolveErrs, d.ValidateErrs = filterToBuffer(run.res, d.sourceFile)
	if modRoot != "" {
		d.ResolveErrs = append(d.ResolveErrs, lostModuleErrs(run.res, modRoot)...)
	}
	pkg := "" // the default package is not listed
	if len(isolated.Packages) == 1 {
		pkg = isolated.Packages[0].ID
	}
	d.elsewhere = moduleDiagnostics(run.res, d.sourceFile, pkg, filepath.Dir(canon), modRoot, home)
}

// lostModuleErrs copies to the buffer's 1:1 the error that excluded its whole
// module — its twf.mod's MODULE_FILE_INVALID, or the DUPLICATE_MODULE on it —
// which is reported on the twf.mod, a file the editor may not show.
func lostModuleErrs(res pipeline.Result, modRoot string) []*resolver.ResolveError {
	modFile := filepath.ToSlash(filepath.Join(modRoot, "twf.mod"))
	var out []*resolver.ResolveError
	for _, e := range res.ResolveErrs {
		if e.File != modFile || (e.Kind != resolver.ErrModuleFileInvalid && e.Kind != resolver.ErrDuplicateModule) {
			continue
		}
		c := *e
		c.Line, c.Column = 1, 1
		c.Msg = "this file's module is excluded: " + e.Msg + " (twf.mod:" + strconv.Itoa(e.Line) + ")"
		out = append(out, &c)
	}
	return out
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
	// overlays are the open `file:` buffers' texts by canonical path, as the
	// last analysis read them. Guarded by mu.
	overlays map[string]string
	// published are the URIs last published with diagnostics. Guarded by mu.
	published map[string]bool
	// outside is the watch on twf.mod files outside every folder. Guarded by mu.
	outside outsideWatch
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
	s.overlays = overlays
	runs := map[string]analysis{}
	for _, d := range docs {
		d.analyze(s.folders, overlays, runs)
	}
}

// Overlays returns the open `file:` buffers' texts by canonical path. Safe for
// concurrent use; the map must not be modified.
func (s *DocumentStore) Overlays() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.overlays
}

// Folders returns the workspace folders. Safe for concurrent use.
func (s *DocumentStore) Folders() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.folders
}

// Reanalyze re-analyzes every open document, for a change on disk the store
// did not see (a twf.mod). Safe for concurrent use.
func (s *DocumentStore) Reanalyze() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reanalyze()
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
