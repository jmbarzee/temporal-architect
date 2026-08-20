package envelope

import (
	"fmt"
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

// ParseFiles reads and parses the given inputs, returning the merged AST and
// any diagnostics. Each input may be a `.twf` file or a directory (a tree
// root): directories are expanded recursively to the `.twf` files they contain
// (issue #109), so an `import` has a tree to resolve against. Each file is
// parsed independently with per-file line numbers; definitions are stamped
// with their source file and owning package and merged into a single AST for
// resolution.
//
// A single-file or explicit-file-list invocation behaves exactly as before —
// directory expansion only kicks in when an argument names a directory.
//
// Diagnostics are returned as wire-format Diagnostic values (structured,
// JSON-ready). The previous string-formatted shape is gone — callers that
// need a human-readable rendering should format Diagnostics themselves.
func ParseFiles(paths []string) (*ast.File, []Diagnostic, error) {
	if len(paths) == 0 {
		return nil, nil, fmt.Errorf("no input files")
	}

	files, err := expandInputs(paths)
	if err != nil {
		return nil, nil, err
	}
	if len(files) == 0 {
		return nil, nil, fmt.Errorf("no .twf files found in %v", paths)
	}

	sources := make([]source, 0, len(files))
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, nil, fmt.Errorf("read %s: %w", path, err)
		}
		sources = append(sources, source{base: filepath.Base(path), content: string(data)})
	}

	// Single-file mode: every resolve/validate diagnostic is attributable to
	// the one input file. Multi-file mode: we can only attribute diagnostics
	// keyed to a definition name (e.g. duplicate-X errors); the rest carry
	// an empty file field and downstream tooling must rely on line/column.
	defaultFile := ""
	if len(files) == 1 {
		defaultFile = filepath.Base(files[0])
	}

	file, diags := parseSources(sources, defaultFile)
	return file, diags, nil
}

// expandInputs turns a mix of file and directory arguments into a flat list of
// `.twf` file paths. A file argument is kept verbatim (order preserved, so an
// explicit file list parses in the order given); a directory argument is walked
// recursively and its `.twf` files spliced in at that position in lexical order
// so a tree parses deterministically. A nonexistent path is a hard error.
func expandInputs(paths []string) ([]string, error) {
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
		var found []string
		err = filepath.WalkDir(path, func(p string, d os.DirEntry, err error) error {
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
			return nil, fmt.Errorf("walk %s: %w", path, err)
		}
		sort.Strings(found)
		out = append(out, found...)
	}
	return out, nil
}

// ParseSource parses a single in-memory TWF document, returning the AST and
// diagnostics. It is the file-less twin of ParseFiles for callers that already
// hold the source text (e.g. the `twf mcp` tools checking an editor buffer).
// name is used only for diagnostic attribution; an empty name defaults to
// "<source>.twf".
func ParseSource(name, content string) (*ast.File, []Diagnostic, error) {
	base := filepath.Base(name)
	if name == "" {
		base = "<source>.twf"
	}
	file, diags := parseSources([]source{{base: base, content: content}}, base)
	return file, diags, nil
}

// parseSources is the shared pipeline behind ParseFiles and ParseSource: parse
// each source independently, stamp and merge definitions, then resolve and
// validate the merged AST once. defaultFile is the fallback file attribution
// for resolve/validate diagnostics that are not definition-keyed.
func parseSources(sources []source, defaultFile string) (*ast.File, []Diagnostic) {
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
		// Prefer the reference-site file the resolver now carries (issue #136);
		// fall back to the name-lookup heuristic only when it is empty (e.g. a
		// node the merge left unstamped). The validator path below keeps using
		// fileForDiagnostic — validator errors carry no File.
		file := e.File
		if file == "" {
			file = fileForDiagnostic(merged, e.Name, defaultFile)
		}
		diags = append(diags, FromResolveError(e, file))
	}

	validateErrs := validator.Validate(merged)
	for _, e := range validateErrs {
		diags = append(diags, FromValidateError(e, fileForDiagnostic(merged, e.Name, defaultFile)))
	}

	return merged, diags
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
// if not found. Resolver/validator errors only carry the entity name, not
// the file — looking it up here lets us populate the diagnostic's `file`
// field without changing the parser error types.
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
// resolver and graph read it, but it is not serialized. Mirrors setSourceFile.
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
