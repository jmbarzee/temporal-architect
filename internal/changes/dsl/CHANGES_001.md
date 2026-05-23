# DSL Changes

**Source review(s):** `reflect-skill` (design skill reflection on `examples/human-in-the-loop-access-control`), `reflect-skill` (design skill reflection on `tools/orchestrator/dev-cycle.twf`)
**REVISIONS file(s):** `DSL_REVISIONS.md` (consumed)

## Summary

Fixed a parser bug where dot-qualified result bindings (`-> item.result`) broke options block parsing, and corrected incorrect `await one` cancellation semantics in the language spec.

## Changes by Type

### Semantic

- **`tools/lsp/LANGUAGE_SPEC.md:555`**: Corrected `await one` cancellation semantics. Previous text stated non-winning cases are "automatically cancelled" — this is wrong. Non-winning cases continue running until the workflow run ends. Replaced with correct lifecycle description including `parent_close_policy` interaction.
- **`tools/lsp/LANGUAGE_SPEC.md:332`**: Added `parent_close_policy` value descriptions (`TERMINATE`, `REQUEST_CANCEL`, `ABANDON`) to the workflow call options section.

### Internal

- **`tools/lsp/parser/parser/helpers.go`**: Added `parseDotQualifiedIdent()` method — consumes `IDENT [DOT IDENT]*` for dot-qualified result bindings like `-> item.result` or `-> a.b.c`.
- **`tools/lsp/parser/parser/statements_calls.go:parseCallParts`**: Result binding after `->` now uses `parseDotQualifiedIdent()` instead of single `expect(IDENT)`.
- **`tools/lsp/parser/parser/statements_async.go`**: Five async target parsers updated to use `parseDotQualifiedIdent()` for result/param bindings: `parseActivityTarget`, `parseWorkflowOrNexusTarget`, `parseNexusTarget`, `parseIdentTarget`, `parseParamBinding`.
- **`POSSIBLE_DSL_FEATURES.md`**: Updated "Known Parser Issues" section with corrected root cause (dot-qualified result binding, not lexer DEDENT cascade). Added "Completion-Order Promise Iteration" feature idea. Added 3 lint rule candidates (sequential child workflow loop, blocking update handler, fallback-path history growth).
