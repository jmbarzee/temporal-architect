package main

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
)

// Diagnostic is the wire-format diagnostic emitted in every JSON envelope
// produced by twf. It is the stable contract for downstream consumers
// (spec-builder, IDE clients, doc tooling, LLM consumers).
//
// The fields are deliberately small and orthogonal:
//   - severity is "error" or "warning"
//   - kind groups diagnostics by producing stage: "parse", "resolve",
//     "validate", or "graph"
//   - code is a symbolic, stable identifier within a kind (e.g. UNDEFINED_ACTIVITY)
//   - start and end are 1-based line/column positions; end == start where the
//     producing stage has not computed a span (always present, never null)
//   - name carries the primary entity the diagnostic is about, when one exists
//     (the referenced workflow, the duplicate definition's name, …)
//
// Adding a new code or a new optional field is a non-breaking change; renaming
// or removing a code is breaking and requires a coordinated bump.
type Diagnostic struct {
	Severity string   `json:"severity"`
	Kind     string   `json:"kind"`
	Code     string   `json:"code"`
	File     string   `json:"file,omitempty"`
	Start    Position `json:"start"`
	End      Position `json:"end"`
	Message  string   `json:"message"`
	Name     string   `json:"name,omitempty"`
}

// Position is a 1-based line/column source position. Column 0 means "unknown
// column" and is preserved verbatim from the producing stage.
type Position struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}

// Envelope is the top-level shape of every `--json` output.
//
//	{
//	  "summary":     { ... },
//	  "diagnostics": [ ... ],
//	  "<payload>":   ...
//	}
//
// Each subcommand attaches a single payload field whose key is the command's
// purpose: parse → "definitions", symbols → "symbols", graph → "graph".
// check emits an envelope without a payload (it IS diagnostics).
type Envelope struct {
	Summary     ast.FileSummary `json:"summary"`
	Diagnostics []Diagnostic    `json:"diagnostics"`

	// Optional payload fields. Exactly one (or none, for check) is populated
	// per command. The naming matches each subcommand's existing data shape
	// so consumers can swap commands without remapping schemas.
	Definitions interface{} `json:"definitions,omitempty"`
	Symbols     interface{} `json:"symbols,omitempty"`
	Graph       interface{} `json:"graph,omitempty"`
	Chunks      interface{} `json:"chunks,omitempty"`
}

// fromParseError lifts a parser error into the wire Diagnostic shape.
func fromParseError(e *parser.ParseError, file string) Diagnostic {
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

// fromResolveError lifts a resolver error into the wire Diagnostic shape.
func fromResolveError(e *resolver.ResolveError, file string) Diagnostic {
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

// fromValidateError lifts a validator error into the wire Diagnostic shape.
func fromValidateError(e *validator.Error, file string) Diagnostic {
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

// summarize builds a FileSummary from a parsed AST and counts diagnostics
// into Errors/Warnings. The AST-side counts are produced via the existing
// MarshalJSON path; here we recreate them from the same switch so that the
// CLI can carry them without round-tripping through JSON.
func summarize(file *ast.File, diags []Diagnostic) ast.FileSummary {
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

// hasErrors returns true if any diagnostic in the slice has severity "error".
// Severity-aware exit codes use this; counting non-error severities (warnings)
// must not flip the exit code.
func hasErrors(diags []Diagnostic) bool {
	for _, d := range diags {
		if d.Severity == "error" {
			return true
		}
	}
	return false
}

// ensureSlice returns the input slice or, if it is nil, a non-nil empty slice.
// JSON consumers of the wire contract see an empty array, never null —
// regardless of whether analysis produced no diagnostics or hit a fast path.
func ensureSlice(diags []Diagnostic) []Diagnostic {
	if diags == nil {
		return []Diagnostic{}
	}
	return diags
}
