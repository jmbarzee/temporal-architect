# Parser Alignment Review

Align the parser implementation to the DSL spec. The spec is authoritative — the parser is the target.

This command answers: "does the parser correctly and completely implement everything in `LANGUAGE_SPEC.md`?"

Parser quality and code health belong in `/project:review-quality-parser`. DSL design belongs in `/project:review-quality-dsl-spec`. This command is solely gap detection between spec and implementation.

## Context

- `tools/lsp/LANGUAGE_SPEC.md` — authoritative source of truth
- `PARSER_REVISIONS.md` — if present, read to avoid re-reporting known gaps

## Workflow

### Phase 1: Explore

Use sub-agents in parallel:
- **Spec agent**: Read `LANGUAGE_SPEC.md` in full. Build a complete inventory of every construct, keyword, option, and error condition the DSL defines.
- **Parser agent**: Read all Go files in `parser/lexer/`, `parser/parser/`, `parser/ast/`, `parser/resolver/`. For each spec construct, determine: is it handled? Does it produce the right AST shape? Does it emit the right errors on invalid input?

### Phase 2: Catalog

For each spec construct:
- **Status**: `implemented` | `partial` | `missing` | `incorrect`
- **Gap**: what's absent, wrong, or incomplete
- **Severity**: `critical` (construct silently ignored or crashes) | `moderate` (partially handled) | `minor` (edge case or error message mismatch)

Run representative `.twf` examples through `twf parse` to validate behavior. Don't rely on code reading alone.

### Phase 3: Group & Prioritize

Group by construct family (e.g., "timer options", "nexus endpoints", "signal handlers"). Order by severity.

### Phase 4: Write to `PARSER_ALIGNMENT_REVISIONS.md`

Write the grouped plan to `PARSER_ALIGNMENT_REVISIONS.md` at the repo root:
- Brief summary: coverage state, what's missing
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Grammar` | `API` | `Semantic`), parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `/project:address-review`.**

## Constraints
- **Spec is authoritative.** Don't question DSL design decisions — that's `/project:review-dsl-spec`.
- **Run `twf parse`, don't just read code.** Actual behavior may differ from what the code suggests.
- **Incorrect is worse than missing.** A construct that silently parses wrong is more dangerous than one that fails with a clear error.
