# DSL Changes

**Source review(s):** `reflect-skill` (design skill reflection on `examples/human-in-the-loop-access-control`), `reflect-skill` (design skill reflection on `internal/orchestrator/dev-cycle.twf`)
**REVISIONS file(s):** `DSL_REVISIONS.md` (consumed and removed — the dev cycle deletes a REVISIONS file once its CHANGES record lands)

## Summary

Fixed a parser bug where dot-qualified result bindings (`-> item.result`) broke options block parsing, and corrected incorrect `await one` cancellation semantics in the language spec.

## Changes by Type

### Semantic

- **`tools/spec/sections/06-statement-syntax.md` § Await One Block**: Corrected `await one` cancellation semantics. Previous text stated non-winning cases are "automatically cancelled" — this is wrong. Non-winning cases continue running until the workflow run ends. Replaced with correct lifecycle description including `parent_close_policy` interaction.
- **`tools/spec/sections/06-statement-syntax.md` § Options Block**: Added `parent_close_policy` value descriptions (`TERMINATE`, `REQUEST_CANCEL`, `ABANDON`) to the workflow call options section.

### Internal

- **`tools/lsp/parser/parser/helpers.go`**: Added `parseDotQualifiedIdent()` method — consumes `IDENT [DOT IDENT]*` for dot-qualified result bindings like `-> item.result` or `-> a.b.c`.
- **`tools/lsp/parser/parser/statements_calls.go:parseCallParts`**: Result binding after `->` now uses `parseDotQualifiedIdent()` instead of single `expect(IDENT)`.
- **`tools/lsp/parser/parser/statements_async.go`**: Five async target parsers updated to use `parseDotQualifiedIdent()` for result/param bindings: `parseActivityTarget`, `parseWorkflowOrNexusTarget`, `parseNexusTarget`, `parseIdentTarget`, `parseParamBinding`.
- **DSL backlog** (now tracked as GitHub issues): Recorded the corrected root cause for the "Known Parser Issues" entry (dot-qualified result binding, not lexer DEDENT cascade). Added "Completion-Order Promise Iteration" feature idea. Added 3 lint rule candidates (sequential child workflow loop, blocking update handler, fallback-path history growth).
