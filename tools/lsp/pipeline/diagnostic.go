package pipeline

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
)

// FromParseError lifts a parser error into the wire Diagnostic shape.
func FromParseError(e *parser.ParseError, file string) Diagnostic {
	pos := Position{Line: e.Line, Column: e.Column}
	return Diagnostic{
		Severity: "error",
		Kind:     "parse",
		Code:     e.Code(),
		File:     file,
		Start:    pos,
		End:      pos,
		Message:  e.Msg,
	}
}

// FromResolveError lifts a resolver error into the wire Diagnostic shape.
func FromResolveError(e *resolver.ResolveError, file string) Diagnostic {
	pos := Position{Line: e.Line, Column: e.Column}
	sev := e.Severity
	if sev == "" {
		sev = "error"
	}
	return Diagnostic{
		Severity: sev,
		Kind:     "resolve",
		Code:     e.Code(),
		File:     file,
		Start:    pos,
		End:      pos,
		Message:  e.Msg,
		Name:     e.Name,
	}
}

// FromValidateError lifts a validator error into the wire Diagnostic shape.
func FromValidateError(e *validator.Error, file string) Diagnostic {
	pos := Position{Line: e.Line, Column: e.Column}
	sev := e.Severity
	if sev == "" {
		sev = "error"
	}
	return Diagnostic{
		Severity: sev,
		Kind:     "validate",
		Code:     e.Code(),
		File:     file,
		Start:    pos,
		End:      pos,
		Message:  e.Msg,
		Name:     e.Name,
	}
}

// Summarize builds a FileSummary from a parsed AST and counts diagnostics
// into Errors/Warnings. The AST-side counts are produced via the existing
// MarshalJSON path; here we recreate them from the same switch so that the
// CLI can carry them without round-tripping through JSON.
func Summarize(file *ast.File, diags []Diagnostic) ast.FileSummary {
	s := ast.FileSummary{}
	if file != nil {
		for _, def := range file.Definitions {
			switch def.(type) {
			case *ast.WorkflowDef:
				s.Workflows++
			case *ast.ActivityDef:
				s.Activities++
			case *ast.WorkerDef:
				s.Workers++
			case *ast.NamespaceDef:
				s.Namespaces++
			case *ast.NexusServiceDef:
				s.NexusServices++
			}
		}
	}
	for _, d := range diags {
		switch d.Severity {
		case "warning":
			s.Warnings++
		default:
			s.Errors++
		}
	}
	return s
}

// HasErrors returns true if any diagnostic in the slice has severity "error".
// Severity-aware exit codes use this; counting non-error severities (warnings)
// must not flip the exit code.
func HasErrors(diags []Diagnostic) bool {
	for _, d := range diags {
		if d.Severity == "error" {
			return true
		}
	}
	return false
}

// HasBlockingError reports whether any diagnostic is severe enough that even
// `--lenient` must not demote it to a clean exit. Structural lexical errors
// (parser.CodeLexical) qualify: the input could not be tokenized, so the parse
// is fundamentally broken and a green exit would actively mislead — consistent
// with the rule that a `--lenient` exit code is not a health signal.
func HasBlockingError(diags []Diagnostic) bool {
	for _, d := range diags {
		if d.Severity == "error" && d.Code == parser.CodeLexical {
			return true
		}
	}
	return false
}

// EnsureSlice returns the input slice or, if it is nil, a non-nil empty slice.
// JSON consumers of the wire contract see an empty array, never null —
// regardless of whether analysis produced no diagnostics or hit a fast path.
func EnsureSlice(diags []Diagnostic) []Diagnostic {
	if diags == nil {
		return []Diagnostic{}
	}
	return diags
}
