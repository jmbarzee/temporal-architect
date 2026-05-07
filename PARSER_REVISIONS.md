# Parser Revisions

**Source:** `reflect-skill`
**Reflection file:** `REFLECTION_DESIGN.md` (consumed)

## Summary

During design of `tools/orchestrator/dev-cycle.twf`, an `options:` block on a workflow call inside deeply nested indentation (`await all` → `for` → `workflow` → `options:`) caused a parse error. The parser lost indentation tracking and reported "unexpected token IDENT at top level" on the line following the options block. Removing the `options:` block made the file parse successfully, confirming the bug.

## Group 1: Options Block at Deep Nesting

**Findings:**
- **P1**: `options:` block on a workflow call inside `await all` → `for` → `workflow` causes `parse error: unexpected token IDENT at top level`. The parser DEDENTs too far when closing the options block at deep indentation (6+ levels), losing track of the enclosing blocks.
- Reproduction: add `options:\n    workflow_execution_timeout: 30m` to a workflow call inside an `await all` block containing a `for` loop. The next statement after the options block at the `for` body indentation level triggers the error.
- The `access-control.twf` example avoids this because its `await all` → `for` → `workflow` calls do not use `options:` blocks. The `document-ingestion.twf` example uses `options:` blocks but not inside `await all` → `for` nesting.

**Files touched:** `tools/lsp/parser/` (likely `parser.go` indentation/DEDENT handling)
**Change type:** `Internal`
**Parallelism:** Independent — no other revisions depend on this fix, though ORCHESTRATOR_REVISIONS Group 2 item D9 is blocked by it.

**Specific changes:**

1. Add a test case: workflow call with `options:` block inside `await all` → `for` at 4+ indentation levels. Verify that the parser correctly closes the options block and resumes at the `for` body indentation level.

2. Investigate the DEDENT emission logic when closing an `options:` block. The options block adds two indentation levels (one for `options:`, one for the key-value pairs). When the next line returns to the `for` body level, the lexer/parser should emit exactly the right number of DEDENTs. The bug suggests it emits too many, collapsing all the way to the top level.
