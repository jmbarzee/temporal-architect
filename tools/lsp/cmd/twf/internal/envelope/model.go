// Package envelope is the twf wire contract and the front-door that produces
// it. It owns the JSON envelope shape (summary + diagnostics + payload), the
// structured Diagnostic model, the parse pipeline (ParseFiles), and the lifters
// that turn pipeline/graph/history output into Diagnostics. Every command
// package consumes it; nothing here knows about cobra.
//
// The shapes below are the stable contract for downstream consumers
// (visualizer, VS Code extension, skills). They are the source of truth; their
// TypeScript projection is generated into the @temporal-architect/wire-types
// package (tools/wire-types) and CI-gated via `make check-types`.
package envelope

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
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

// Envelope is the top-level shape of every `--json` output — the stable wire
// contract emitted by `twf parse`, `twf symbols --json`, `twf graph --json`,
// and `twf graph chunks --json`.
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
//
// Compatibility: adding an optional field or a new diagnostic code is a
// non-breaking change; renaming or removing one is breaking and requires a
// coordinated bump across downstream consumers. The TypeScript projection of
// this contract is generated into @temporal-architect/wire-types.
type Envelope struct {
	Summary     ast.FileSummary `json:"summary"`
	Diagnostics []Diagnostic    `json:"diagnostics"`

	// Optional payload fields. Exactly one (or none, for check) is populated
	// per command. The naming matches each subcommand's existing data shape
	// so consumers can swap commands without remapping schemas.

	// Definitions is present on `twf parse`: the AST definitions array. Item
	// shape is the discriminated `Definition` union in the generated
	// wire-types (keyed by the node `type`).
	Definitions interface{} `json:"definitions,omitempty"`
	// Symbols is present on `twf symbols --json`: the flat symbol list
	// (workflows, activities, workers, namespaces, nexus services).
	Symbols interface{} `json:"symbols,omitempty"`
	// Graph is present on `twf graph --json`: the resolved deployment graph —
	// nodes are runtime deployments (definition × instantiation), edges are
	// confirmed dispatches.
	Graph interface{} `json:"graph,omitempty"`
	// Chunks is present on `twf graph chunks --json`: the topology-based
	// decomposition — the hard partition of authorable definitions, the
	// inter-chunk contract-dependency DAG, and (when a ceiling is set) the
	// ranked soft divisions.
	Chunks interface{} `json:"chunks,omitempty"`
}
