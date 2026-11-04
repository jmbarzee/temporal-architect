package pipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/module"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
)

// source is one named TWF input: its base name (for diagnostic attribution)
// and its raw content.
type source struct {
	base    string
	content string
	// canonical is an on-disk source's identity; "" for a virtual source.
	canonical string
	// module and dir place a virtual source in a module (Source.Module).
	module, dir string
}

// InputKind says how ParseSources expands an Input.
type InputKind int

const (
	// File is one `.twf` file, parsed as given.
	File InputKind = iota
	// Tree is a directory whose `.twf` files are found by a recursive walk.
	Tree
	// Dir is one directory's own `.twf` files, not its subdirectories'.
	Dir
)

// Mode says how ParseSources spells the files it reads, in each definition's
// SourceFile and each diagnostic's File.
type Mode int

const (
	// AsGiven spells a file argument as given and a walked file as its
	// directory argument, `/`, and the path below it (D9): what the CLI and MCP
	// report.
	AsGiven Mode = iota
	// Canonical spells every file by its canonical absolute path: what an
	// editor matches buffers against.
	Canonical
)

// Input is one on-disk input to ParseSources.
type Input struct {
	Path string
	Kind InputKind
}

// Source is one in-memory TWF document. Name is used only for diagnostic
// attribution; an empty Name defaults to "<source>.twf".
//
// A source has no directory, so it is in no module: it is checked as a file
// outside every module is, and a package clause is PACKAGE_OUTSIDE_MODULE.
// Module and Dir place it in a module instead — its package's path is Module,
// plus "/" and Dir when Dir is set — so in-memory sources (tests, a caller
// that knows the context) import each other by path. One request's sources
// are all in a module or none. The other file-level checks of on-disk inputs
// (clause conflicts, the name rule) do not run on in-memory sources.
type Source struct {
	Name    string
	Content string
	Module  string
	Dir     string
}

// Request is one ParseSources run. Inputs and Virtual are mutually exclusive.
//
// A file's identity is its canonical path, so one file named twice — relative
// and absolute, through a symlink, in another letter case — is parsed once, at
// its first position. A walk skips entries named `.*` or `_*`, directories
// named `testdata`, and symlinks; an argument itself is never skipped, and an
// explicit symlinked file argument is followed.
//
// Overlays maps a file path to text that replaces that file's content on disk,
// so an editor can analyze unsaved buffers; overlays match files by identity.
// An overlaid `.twf` file under a Tree or Dir input joins the walk at its
// lexical position even when it is not on disk, and an input missing on disk
// contributes only its overlays.
type Request struct {
	Inputs   []Input
	Virtual  []Source
	Overlays map[string]string
	Mode     Mode
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
	for i, v := range req.Virtual {
		switch {
		case (v.Module == "") != (req.Virtual[0].Module == ""):
			return Result{}, fmt.Errorf("virtual source %d: sources in a module and sources in none cannot share a run", i)
		case v.Module == "" && v.Dir != "":
			return Result{}, fmt.Errorf("virtual source %d: Dir needs a Module", i)
		case v.Module != "" && module.CheckPath(v.Module) != nil:
			return Result{}, fmt.Errorf("virtual source %d: invalid module path %q: %v", i, v.Module, module.CheckPath(v.Module))
		}
		base := "<source>.twf"
		if v.Name != "" {
			base = filepath.Base(v.Name)
		}
		sources = append(sources, source{base: base, content: v.Content, module: v.Module, dir: v.Dir})
	}

	var x *expander
	if len(req.Inputs) > 0 {
		e, err := newExpander(req.Mode, req.Overlays)
		if err != nil {
			return Result{}, err
		}
		x = e
		files, err := e.expand(req.Inputs)
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
		for _, f := range files {
			content, err := e.content(f)
			if err != nil {
				return Result{}, err
			}
			sources = append(sources, source{base: f.spelled, content: content, canonical: f.canonical})
		}
	}

	if len(sources) == 0 {
		return Result{}, fmt.Errorf("no input files")
	}

	// One source: every resolve/validate diagnostic is attributable to it.
	// Several: each error carries its own reference-site file (#136, #238).
	defaultFile := ""
	if len(sources) == 1 {
		defaultFile = sources[0].base
	}

	return parseSources(sources, defaultFile, x), nil
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

	inputs, err := inputsFor(paths)
	if err != nil {
		return nil, nil, err
	}

	res, err := ParseSources(Request{Inputs: inputs})
	if err != nil {
		return nil, nil, err
	}
	return res.File, res.Diagnostics, nil
}

// ExpandInputs turns a mix of file and directory arguments into the `.twf`
// files ParseFiles would read, in order, each spelled as ParseFiles reports it
// (D9) and listed once. A directory argument is walked under ParseSources'
// rules. A nonexistent path is a hard error.
//
// It is exported as the file-watch set an out-of-module server (issue #138)
// needs to enumerate the `.twf` files a set of roots resolves to.
func ExpandInputs(paths []string) ([]string, error) {
	inputs, err := inputsFor(paths)
	if err != nil {
		return nil, err
	}
	e, err := newExpander(AsGiven, nil)
	if err != nil {
		return nil, err
	}
	files, err := e.expand(inputs)
	if err != nil {
		return nil, err
	}
	out := make([]string, len(files))
	for i, f := range files {
		out[i] = f.spelled
	}
	return out, nil
}

// inputsFor takes each path's kind from the disk: a directory is a Tree.
func inputsFor(paths []string) ([]Input, error) {
	inputs := make([]Input, 0, len(paths))
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			return nil, fmt.Errorf("stat %s: %w", path, err)
		}
		kind := File
		if info.IsDir() {
			kind = Tree
		}
		inputs = append(inputs, Input{Path: path, Kind: kind})
	}
	return inputs, nil
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
// defaultFile is the file attribution for a resolve/validate error that
// carries none.
func parseSources(sources []source, defaultFile string, x *expander) Result {
	var diags []Diagnostic

	files := make([]*parsed, len(sources))
	for i, s := range sources {
		file, parseErrs := parser.ParseFileAll(s.content)
		files[i] = &parsed{src: s, pos: i, file: file, errs: parseErrs}
		for _, e := range parseErrs {
			diags = append(diags, FromParseError(e, s.base))
		}
	}

	// File-level exclusions: an excluded file reports its parse errors and the
	// reason it was excluded, and takes no part in anything else.
	var pkgErrs []*resolver.ResolveError
	if x != nil {
		pkgErrs = x.exclude(files)
	} else {
		pkgErrs = excludeVirtual(files)
	}

	// Merge the kept files. A package's identity is its import path.
	var kept []ast.StampInput
	for _, p := range files {
		if p.excluded {
			continue
		}
		in := ast.StampInput{File: p.file, SourceFile: p.src.base, Module: p.modPath}
		if p.root != "" {
			if rel, err := filepath.Rel(p.root, p.dir); err == nil && rel != "." {
				in.Dir = filepath.ToSlash(rel)
			}
		} else {
			in.Dir = p.src.dir
		}
		kept = append(kept, in)
	}
	merged := ast.Stamp(kept)
	if x != nil {
		paths := map[string]bool{}
		for _, info := range merged.Packages {
			if info.Path != "" {
				paths[info.Path] = true
			}
		}
		merged.ImportOutcomes = x.lookupImports(files, paths)
	}

	// A resolve or validate error carries the reference-site file (#136,
	// #238); one with none is attributed to the sole source, if any.
	// A twf.mod sorts at its module's position, before that module's files.
	pos := make(map[string]int, len(sources))
	for i, s := range sources {
		pos[s.base] = 2*i + 1
	}
	if x != nil {
		for f, p := range x.modFilePos {
			pos[f] = 2 * p
		}
	}
	filePos := func(f string) int {
		if p, ok := pos[f]; ok {
			return p
		}
		return 2 * len(sources)
	}

	resolveErrs := append(pkgErrs, resolver.Resolve(merged)...)
	for _, e := range resolveErrs {
		if e.File == "" {
			e.File = defaultFile
		}
	}
	sort.SliceStable(resolveErrs, func(i, j int) bool {
		a, b := resolveErrs[i], resolveErrs[j]
		return lessDiag(filePos(a.File), a.Line, a.Column, a.Code(), a.Msg, filePos(b.File), b.Line, b.Column, b.Code(), b.Msg)
	})
	for _, e := range resolveErrs {
		diags = append(diags, FromResolveError(e, e.File))
	}

	validateErrs := validator.Validate(merged)
	for _, e := range validateErrs {
		if e.File == "" {
			e.File = defaultFile
		}
	}
	sort.SliceStable(validateErrs, func(i, j int) bool {
		a, b := validateErrs[i], validateErrs[j]
		return lessDiag(filePos(a.File), a.Line, a.Column, a.Code(), a.Msg, filePos(b.File), b.Line, b.Column, b.Code(), b.Msg)
	})
	for _, e := range validateErrs {
		diags = append(diags, FromValidateError(e, e.File))
	}

	return Result{File: merged, Diagnostics: diags, ResolveErrs: resolveErrs, ValidateErrs: validateErrs}
}

// lessDiag orders diagnostics of one phase by input position of their file,
// then line, column, code and message, so their order never follows map
// iteration.
func lessDiag(fa, la, ca int, codeA, msgA string, fb, lb, cb int, codeB, msgB string) bool {
	switch {
	case fa != fb:
		return fa < fb
	case la != lb:
		return la < lb
	case ca != cb:
		return ca < cb
	case codeA != codeB:
		return codeA < codeB
	}
	return msgA < msgB
}
