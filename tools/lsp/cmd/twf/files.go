package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
)

// parseFiles reads and parses the given files, returning the merged AST and
// any diagnostics. Each file is parsed independently with per-file line
// numbers; definitions are stamped with their source file and merged into
// a single AST for resolution.
//
// Diagnostics are returned as wire-format Diagnostic values (structured,
// JSON-ready). The previous string-formatted shape is gone — callers that
// need a human-readable rendering should format Diagnostics themselves.
func parseFiles(paths []string) (*ast.File, []Diagnostic, error) {
	if len(paths) == 0 {
		return nil, nil, fmt.Errorf("no input files")
	}

	merged := &ast.File{}
	var diags []Diagnostic

	for _, path := range paths {
		base := filepath.Base(path)

		data, err := os.ReadFile(path)
		if err != nil {
			return nil, nil, fmt.Errorf("read %s: %w", path, err)
		}

		file, parseErrs := parser.ParseFileAll(string(data))

		for _, e := range parseErrs {
			diags = append(diags, fromParseError(e, base))
		}

		for _, def := range file.Definitions {
			setSourceFile(def, base)
			merged.Definitions = append(merged.Definitions, def)
		}
	}

	// Single-file mode: every resolve/validate diagnostic is attributable to
	// the one input file. Multi-file mode: we can only attribute diagnostics
	// keyed to a definition name (e.g. duplicate-X errors); the rest carry
	// an empty file field and downstream tooling must rely on line/column.
	defaultFile := ""
	if len(paths) == 1 {
		defaultFile = filepath.Base(paths[0])
	}

	resolveErrs := resolver.Resolve(merged)
	for _, e := range resolveErrs {
		diags = append(diags, fromResolveError(e, fileForDiagnostic(merged, e.Name, defaultFile)))
	}

	validateErrs := validator.Validate(merged)
	for _, e := range validateErrs {
		diags = append(diags, fromValidateError(e, fileForDiagnostic(merged, e.Name, defaultFile)))
	}

	return merged, diags, nil
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
