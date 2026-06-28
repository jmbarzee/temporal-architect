package envelope

import (
	"fmt"
	"os"
	"path/filepath"

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

// ParseFiles reads and parses the given files, returning the merged AST and
// any diagnostics. Each file is parsed independently with per-file line
// numbers; definitions are stamped with their source file and merged into
// a single AST for resolution.
//
// Diagnostics are returned as wire-format Diagnostic values (structured,
// JSON-ready). The previous string-formatted shape is gone — callers that
// need a human-readable rendering should format Diagnostics themselves.
func ParseFiles(paths []string) (*ast.File, []Diagnostic, error) {
	if len(paths) == 0 {
		return nil, nil, fmt.Errorf("no input files")
	}

	sources := make([]source, 0, len(paths))
	for _, path := range paths {
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
	if len(paths) == 1 {
		defaultFile = filepath.Base(paths[0])
	}

	file, diags := parseSources(sources, defaultFile)
	return file, diags, nil
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

	for _, s := range sources {
		file, parseErrs := parser.ParseFileAll(s.content)

		for _, e := range parseErrs {
			diags = append(diags, FromParseError(e, s.base))
		}

		for _, def := range file.Definitions {
			setSourceFile(def, s.base)
			merged.Definitions = append(merged.Definitions, def)
		}
	}

	resolveErrs := resolver.Resolve(merged)
	for _, e := range resolveErrs {
		diags = append(diags, FromResolveError(e, fileForDiagnostic(merged, e.Name, defaultFile)))
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
