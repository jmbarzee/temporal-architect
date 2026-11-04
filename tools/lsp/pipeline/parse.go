package pipeline

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
)

// source is one named TWF input: its base name (for diagnostic attribution)
// and its raw content.
type source struct {
	base    string
	content string
}

// InputKind says how ParseSources expands an Input.
type InputKind int

const (
	// File is one `.twf` file, parsed as given.
	File InputKind = iota
	// Tree is a directory whose `.twf` files are found by a recursive walk and
	// parsed in lexical order.
	Tree
)

// Input is one on-disk input to ParseSources.
type Input struct {
	Path string
	Kind InputKind
}

// Source is one in-memory TWF document. Name is used only for diagnostic
// attribution; an empty Name defaults to "<source>.twf".
type Source struct {
	Name    string
	Content string
}

// Request is one ParseSources run. Inputs and Virtual are mutually exclusive.
//
// Overlays maps a file path to text that replaces that file's content on disk,
// so an editor can analyze an unsaved buffer. An overlaid `.twf` file under a
// Tree input joins the walk at its lexical position even when it is not on
// disk, and a File input that is not on disk is read from its overlay.
type Request struct {
	Inputs   []Input
	Virtual  []Source
	Overlays map[string]string
}

// Result is the merged AST and diagnostics of one ParseSources run.
// ResolveErrs and ValidateErrs are the typed errors behind Diagnostics, for
// callers that need more than the wire shape (the LSP's code actions read
// ResolveError.Kind and .Name); each one's File is the file its Diagnostic
// names.
type Result struct {
	File         *ast.File
	Diagnostics  []Diagnostic
	ResolveErrs  []*resolver.ResolveError
	ValidateErrs []*validator.Error
}

// ParseSources is the multi-source entry point behind ParseFiles and
// ParseSource: it expands the request's inputs, parses each source
// independently with per-file line numbers, stamps every definition with its
// source file and owning package, merges them into a single AST, and resolves
// and validates that AST once. A file reached by more than one input is parsed
// once, at its first position.
func ParseSources(req Request) (Result, error) {
	if len(req.Inputs) > 0 && len(req.Virtual) > 0 {
		return Result{}, fmt.Errorf("inputs and virtual sources are mutually exclusive")
	}

	var sources []source
	for _, v := range req.Virtual {
		base := "<source>.twf"
		if v.Name != "" {
			base = filepath.Base(v.Name)
		}
		sources = append(sources, source{base: base, content: v.Content})
	}

	if len(req.Inputs) > 0 {
		overlays := make(map[string]string, len(req.Overlays))
		for p, text := range req.Overlays {
			overlays[absPath(p)] = text
		}
		files, err := expandRequest(req.Inputs, overlays)
		if err != nil {
			return Result{}, err
		}
		if len(files) == 0 {
			paths := make([]string, len(req.Inputs))
			for i, in := range req.Inputs {
				paths[i] = in.Path
			}
			return Result{}, fmt.Errorf("no .twf files found in %v", paths)
		}
		for _, path := range files {
			content, ok := overlays[absPath(path)]
			if !ok {
				data, err := os.ReadFile(path)
				if err != nil {
					return Result{}, fmt.Errorf("read %s: %w", path, err)
				}
				content = string(data)
			}
			sources = append(sources, source{base: filepath.Base(path), content: content})
		}
	}

	if len(sources) == 0 {
		return Result{}, fmt.Errorf("no input files")
	}

	// One source: every resolve/validate diagnostic is attributable to it.
	// Several: resolve and validate errors carry their own reference-site file
	// (#136, #238); one that does not falls back to the file of the definition
	// its name points at, else stays empty.
	defaultFile := ""
	if len(sources) == 1 {
		defaultFile = sources[0].base
	}

	return parseSources(sources, defaultFile), nil
}

// ParseFiles reads and parses the given inputs, returning the merged AST and
// any diagnostics. Each input may be a `.twf` file or a directory (a tree
// root): directories are expanded recursively to the `.twf` files they contain
// (issue #109), so an `import` has a tree to resolve against. It is
// ParseSources with each path's kind taken from the disk.
//
// Diagnostics are returned as wire-format Diagnostic values (structured,
// JSON-ready). Callers that need a human-readable rendering format them
// themselves.
func ParseFiles(paths []string) (*ast.File, []Diagnostic, error) {
	if len(paths) == 0 {
		return nil, nil, fmt.Errorf("no input files")
	}

	inputs := make([]Input, 0, len(paths))
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			return nil, nil, fmt.Errorf("stat %s: %w", path, err)
		}
		kind := File
		if info.IsDir() {
			kind = Tree
		}
		inputs = append(inputs, Input{Path: path, Kind: kind})
	}

	res, err := ParseSources(Request{Inputs: inputs})
	if err != nil {
		return nil, nil, err
	}
	return res.File, res.Diagnostics, nil
}

// ExpandInputs turns a mix of file and directory arguments into a flat list of
// `.twf` file paths. A file argument is kept verbatim (order preserved, so an
// explicit file list parses in the order given); a directory argument is walked
// recursively and its `.twf` files spliced in at that position in lexical order
// so a tree parses deterministically. A nonexistent path is a hard error.
//
// It is exported as the file-watch set an out-of-module server (issue #138)
// needs to enumerate the `.twf` files a set of roots resolves to.
func ExpandInputs(paths []string) ([]string, error) {
	var out []string
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			return nil, fmt.Errorf("stat %s: %w", path, err)
		}
		if !info.IsDir() {
			out = append(out, path)
			continue
		}
		found, err := walkTree(path)
		if err != nil {
			return nil, err
		}
		out = append(out, found...)
	}
	return out, nil
}

// expandRequest expands ParseSources' inputs to the files to parse, in order,
// each at most once. overlays is keyed by absolute path.
func expandRequest(inputs []Input, overlays map[string]string) ([]string, error) {
	var out []string
	seen := map[string]bool{}
	add := func(path string) {
		abs := absPath(path)
		if seen[abs] {
			return
		}
		seen[abs] = true
		out = append(out, path)
	}

	for _, in := range inputs {
		_, overlaid := overlays[absPath(in.Path)]
		info, err := os.Stat(in.Path)
		switch {
		case err != nil && errors.Is(err, fs.ErrNotExist) && in.Kind == File && overlaid:
			add(in.Path)
			continue
		case err != nil && errors.Is(err, fs.ErrNotExist) && in.Kind == Tree && len(overlaysUnder(in.Path, overlays)) > 0:
			// A missing tree contributes only its overlays.
		case err != nil:
			return nil, fmt.Errorf("stat %s: %w", in.Path, err)
		case in.Kind == File && info.IsDir():
			return nil, fmt.Errorf("%s is a directory, not a file", in.Path)
		case in.Kind == Tree && !info.IsDir():
			return nil, fmt.Errorf("%s is not a directory", in.Path)
		}

		if in.Kind == File {
			add(in.Path)
			continue
		}

		var found []string
		if err == nil {
			if found, err = walkTree(in.Path); err != nil {
				return nil, err
			}
		}
		onDisk := map[string]bool{}
		for _, p := range found {
			onDisk[absPath(p)] = true
		}
		for _, p := range overlaysUnder(in.Path, overlays) {
			if !onDisk[absPath(p)] {
				found = append(found, p)
			}
		}
		sort.Strings(found)
		for _, p := range found {
			add(p)
		}
	}
	return out, nil
}

// walkTree returns the `.twf` files under root, in lexical order.
func walkTree(root string) ([]string, error) {
	var found []string
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if strings.HasSuffix(p, ".twf") {
			found = append(found, p)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk %s: %w", root, err)
	}
	sort.Strings(found)
	return found, nil
}

// overlaysUnder returns the overlaid `.twf` files below root, spelled as root
// joined with their path relative to it, so they sort among the walked files.
func overlaysUnder(root string, overlays map[string]string) []string {
	absRoot := absPath(root)
	var out []string
	for abs := range overlays {
		if !strings.HasSuffix(abs, ".twf") {
			continue
		}
		rel, err := filepath.Rel(absRoot, abs)
		if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		out = append(out, filepath.Join(root, rel))
	}
	return out
}

// absPath is path made absolute and clean, or path itself when that fails.
func absPath(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		return filepath.Clean(path)
	}
	return abs
}

// ParseSource parses a single in-memory TWF document, returning the AST and
// diagnostics. It is the file-less twin of ParseFiles for callers that already
// hold the source text (e.g. the `twf mcp` tools checking an editor buffer).
// name is used only for diagnostic attribution; an empty name defaults to
// "<source>.twf".
func ParseSource(name, content string) (*ast.File, []Diagnostic, error) {
	res, err := ParseSources(Request{Virtual: []Source{{Name: name, Content: content}}})
	if err != nil {
		return nil, nil, err
	}
	return res.File, res.Diagnostics, nil
}

// parseSources is the core of ParseSources: parse each source independently,
// stamp and merge definitions, then resolve and validate the merged AST once.
// defaultFile is the fallback file attribution for resolve/validate
// diagnostics that are not definition-keyed.
func parseSources(sources []source, defaultFile string) Result {
	merged := &ast.File{}
	var diags []Diagnostic

	// Track the distinct packages seen across all files so the merged
	// File.Package can be set to the sole package (single-package tree) or
	// left empty (multi-package tree). The resolver keys off the per-def
	// stamp, not this field, once multiple packages are present.
	pkgSeen := map[string]bool{}

	for _, s := range sources {
		file, parseErrs := parser.ParseFileAll(s.content)

		for _, e := range parseErrs {
			diags = append(diags, FromParseError(e, s.base))
		}

		pkgSeen[file.Package] = true

		// Thread the file's imports into the merged payload, each stamped with
		// its owning package so the resolver can build per-package binding
		// tables. Runtime-only — never serialized.
		for _, imp := range file.Imports {
			imp.Package = file.Package
			imp.SourceFile = s.base
			merged.Imports = append(merged.Imports, imp)
		}

		for _, def := range file.Definitions {
			setSourceFile(def, s.base)
			setPackage(def, file.Package)
			merged.Definitions = append(merged.Definitions, def)
		}
	}

	// Sole package when the whole tree is single-package (every file shares one
	// package clause, including the all-default case); empty when the merge
	// spans multiple packages.
	if len(pkgSeen) == 1 {
		for pkg := range pkgSeen {
			merged.Package = pkg
		}
	}

	resolveErrs := resolver.Resolve(merged)
	for _, e := range resolveErrs {
		// Prefer the reference-site file the resolver carries (issue #136);
		// fall back to the name-lookup heuristic only when it is empty (e.g. a
		// node the merge left unstamped).
		if e.File == "" {
			e.File = fileForDiagnostic(merged, e.Name, defaultFile)
		}
		diags = append(diags, FromResolveError(e, e.File))
	}

	validateErrs := validator.Validate(merged)
	for _, e := range validateErrs {
		// Same shape as the resolver loop: the validator carries the
		// reference-site file too (issue #238).
		if e.File == "" {
			e.File = fileForDiagnostic(merged, e.Name, defaultFile)
		}
		diags = append(diags, FromValidateError(e, e.File))
	}

	return Result{File: merged, Diagnostics: diags, ResolveErrs: resolveErrs, ValidateErrs: validateErrs}
}

// fileForDiagnostic chooses the best source-file attribution for a
// resolver/validator diagnostic. Definition-keyed errors look up the
// owning file; otherwise the single-file default applies. Empty when both
// fail (the multi-file, unattributable case — line/column are still set).
func fileForDiagnostic(file *ast.File, name, defaultFile string) string {
	if src := defFileFor(file, name); src != "" {
		return src
	}
	return defaultFile
}

// defFileFor returns the source file of the definition named `name`, or ""
// if not found. It is the fallback for a resolver/validator error that carries
// no File of its own.
func defFileFor(file *ast.File, name string) string {
	if file == nil || name == "" {
		return ""
	}
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			if d.Name == name {
				return d.SourceFile
			}
		case *ast.ActivityDef:
			if d.Name == name {
				return d.SourceFile
			}
		case *ast.WorkerDef:
			if d.Name == name {
				return d.SourceFile
			}
		case *ast.NamespaceDef:
			if d.Name == name {
				return d.SourceFile
			}
		case *ast.NexusServiceDef:
			if d.Name == name {
				return d.SourceFile
			}
		}
	}
	return ""
}

// setSourceFile stamps a definition with its source file name.
func setSourceFile(def ast.Definition, sourceFile string) {
	switch d := def.(type) {
	case *ast.WorkflowDef:
		d.SourceFile = sourceFile
	case *ast.ActivityDef:
		d.SourceFile = sourceFile
	case *ast.WorkerDef:
		d.SourceFile = sourceFile
	case *ast.NamespaceDef:
		d.SourceFile = sourceFile
	case *ast.NexusServiceDef:
		d.SourceFile = sourceFile
	}
}

// setPackage stamps a definition with its owning package (the declaring file's
// package clause; empty is the implicit default package). Runtime-only — the
// resolver and graph read it, and the AST wire emits only the qualifiedName
// derived from it, never the stamp itself. Mirrors setSourceFile.
func setPackage(def ast.Definition, pkg string) {
	switch d := def.(type) {
	case *ast.WorkflowDef:
		d.Package = pkg
	case *ast.ActivityDef:
		d.Package = pkg
	case *ast.WorkerDef:
		d.Package = pkg
	case *ast.NamespaceDef:
		d.Package = pkg
	case *ast.NexusServiceDef:
		d.Package = pkg
	}
}
