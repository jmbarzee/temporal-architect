# Parser Changes

**Source review(s):** propagated from `internal/changes/dsl/CHANGES_004.md` (handler options framework)
**REVISIONS file(s):** none (executed inline alongside the DSL spec changes, same effort)

## Summary

Propagated the handler `options:` sub-block into the parser: signal, query, and update handler declarations now carry an optional options block at the head of their body, validated against per-handler-kind key schemas.

## Changes by Type

### Schema

- New optional `options` field in the JSON for `signalDecl` / `queryDecl` / `updateDecl` (the existing `OptionsBlockJSON` shape, `omitempty`). No change when no options block is present.

### API

- **`tools/lsp/parser/ast/ast.go`**: added `Options *OptionsBlock` to `SignalDecl`, `QueryDecl`, `UpdateDecl`.
- **`tools/lsp/parser/parser/options.go`**: added `OptionsContextSignalHandler`, `OptionsContextUpdateHandler`, `OptionsContextQueryHandler`, with schemas: signal/update = `{unfinished_policy: enum[abandon, warn_and_abandon], description: string}`, query = `{description: string}`; registered in `optionSchemas`.

### Grammar

- **`tools/lsp/parser/parser/definitions.go`**: `parseSignalDecl` / `parseQueryDecl` / `parseUpdateDecl` parse an optional options block immediately after the body `INDENT` (new `parseHandlerOptions` helper), before statements — mirroring `state:` block placement. Unknown keys / wrong types / invalid enum values are rejected at parse time via the existing option-schema path (e.g. `unfinished_policy` on a query handler → `unknown option key`; an invalid enum value → `invalid value`).

### Internal

- **`tools/lsp/parser/ast/json.go`**: `SignalDeclJSON` / `QueryDeclJSON` / `UpdateDeclJSON` gained an `Options *OptionsBlockJSON` field, populated via `marshalOptionsBlock`. No resolver or walker change (handler decls carry no new child statements; option validation is parse-time).

## Tests

Added parser tests: options on each handler kind; `unfinished_policy` enum validation; query handler rejects `unfinished_policy`; options-only handler body; options followed by statements. All `parser/*` packages build and test green.

## Note on a surfaced backlog item

Option key/type/enum validation happens at parse time (`parseOptionEntry` consulting `schemaForContext`), so these checks ship as generic `SYNTAX` `ParseError`s rather than structured semantic codes. Moving option-schema validation into the resolver (with dedicated `ErrorKind` codes and full multi-error recovery) is recorded in `internal/changes/parser/BACKLOG.md` as a cross-cutting refactor across all option contexts.

## Downstream propagation

- **`internal/changes/visualizer/`** — render handler-level options on handler nodes (chip/annotation). The `options` field on `signalDecl`/`queryDecl`/`updateDecl` JSON is the contract. No new edge kinds.
