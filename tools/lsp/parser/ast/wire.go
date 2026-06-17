package ast

import "encoding/json"

// RawStatement and RawDefinition are aliases for json.RawMessage used only on
// the wire-DTO struct fields in json.go that carry pre-marshalled,
// type-discriminated statement or definition payloads. They are identical to
// json.RawMessage at runtime (so marshalling is unchanged), but give the
// TypeScript generator a distinct, named hook.
//
// They live in this separate file on purpose: the TS generator includes only
// json.go for this package, so these declarations are *excluded* from
// generation and the generator instead resolves them via its type_mappings
// (RawStatement → the `Statement` union, RawDefinition → the `Definition`
// union). That keeps the generated AST's body/definitions arrays typed instead
// of degrading to `any[]`. See tools/wire-types/tygo.yaml.
type (
	RawStatement  = json.RawMessage
	RawDefinition = json.RawMessage
)
