# Align Parser Implementation to LANGUAGE_SPEC.md

This command answers: "does the parser correctly and completely implement everything in `LANGUAGE_SPEC.md`?"

Parser quality and code health belong in `/project:review-quality-parser`. DSL design belongs in `/project:review-quality-dsl-spec`. This command is solely gap detection between spec and implementation.

## Context

- `tools/lsp/LANGUAGE_SPEC.md` — authoritative source of truth
- `tools/lsp/parser/` (`lexer/`, `parser/`, `ast/`, `resolver/`) — target under review
- All existing files in `changes/parser/` — both `*_REVISIONS_*.md` and `CHANGES_*.md` — to avoid re-reporting known gaps or already-addressed issues

## Workflow

### Phase 1: Orient

Briefly scan `LANGUAGE_SPEC.md` (section headings) and the parser directory structure. Confirm the comparison units below still apply — add topics for new spec constructs, drop any removed ones. Produce a confirmed topic list with source and target pointers before launching sub-agents.

**Standard comparison units:**

| # | Topic | Source (LANGUAGE_SPEC.md) | Target (parser packages) |
|---|-------|---------------------------|--------------------------|
| 1 | Token vocabulary & keywords | §Tokens and Keywords (672–745) | `token/token.go`, `lexer/lexer.go` |
| 2 | Lexer indentation handling | §Indentation Rules (773–795) | `lexer/lexer.go` (handleIndent, indentStack, atBOL) |
| 3 | Top-level definitions (Workflow, Activity, Worker, Namespace, Nexus) | §Workflow–§Nexus Service Definitions | `parser/definitions.go`, `workers.go`, `namespaces.go`, `nexus.go`, `ast/ast.go` |
| 4 | Signal, query, update handler declarations | §Signal/Query/Update Declarations, §Context Restrictions | `parser/definitions.go`, `ast/ast.go` |
| 5 | Call statements (activity, workflow, nexus) | §Activity/Workflow/Nexus Call | `parser/statements_calls.go`, `parser/nexus.go`, `parser/options.go`, `ast/ast.go` |
| 6 | Promise & state declarations | §State Block, §Promise Statement, §Set/Unset | `parser/definitions.go`, `statements_misc.go`, `statements_async.go` |
| 7 | Single await statements | §Single Await Statement (426–470) | `parser/statements_async.go`, all AsyncTarget types in `ast/ast.go` |
| 8 | Await all / await one blocks | §Await All Block, §Await One Block (472–553) | `parser/statements_async.go`, `ast/ast.go` |
| 9 | Control flow (switch, if, for, close, return, break, continue) | §Switch–§Break and Continue (557–625) | `parser/statements_control.go`, `statements_misc.go` |
| 10 | Nexus service definitions & operations | §Nexus Service Definitions (219–255) | `parser/nexus.go`, `ast/ast.go` |
| 11 | Options blocks & nested schemas | §Options Block, §Worker/Endpoint Options | `parser/options.go`, `ast/ast.go` |
| 12 | Resolution & reference linking | §Resolution (203–217, 828–882) | `resolver/resolver.go`, `ast/ast.go` (Ref[T]) |

### Phase 2: Parallel Alignment

Launch one sub-agent per topic. Each sub-agent reads the relevant **spec sections AND the corresponding parser code** for its topic, then answers:

- Is this construct handled by the parser? (`implemented` / `partial` / `missing` / `incorrect`)
- If partial or incorrect: what exactly diverges from the spec?
- Does the parser emit the correct AST shape for this construct?
- Does the parser emit the correct errors on invalid input?

Where behavior is ambiguous, run representative `.twf` snippets through `twf parse` — don't rely on code reading alone.

Sub-agents run in parallel. **Every sub-agent reads both sides** — spec sections and parser code — for its topic.

### Phase 3: Catalog

Merge all findings. For each issue:
- **Status**: `implemented` | `partial` | `missing` | `incorrect`
- **Gap**: what's absent, wrong, or incomplete
- **Severity**: `critical` (construct silently ignored or produces wrong AST) | `moderate` (partially handled) | `minor` (edge case or error message mismatch)

Drop anything already tracked in existing `changes/parser/*_REVISIONS_*.md` or `changes/parser/CHANGES_*.md` files.

### Phase 4: Group & Prioritize

Group by construct family. Order: `incorrect` first (silent misparse is worse than a missing construct), then `missing` critical constructs, then `partial`, then `minor`.

### Phase 5: Write to `changes/parser/alignment_REVISIONS_{NNN}.md`

Write the grouped plan to `changes/parser/alignment_REVISIONS_{NNN}.md` (create the `changes/parser/` directory if needed). Use `_001` as the default sequence number; if `_001` already exists, increment to `_002`, etc.
- Brief summary: coverage state, what's missing or incorrect
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Grammar` | `API` | `Semantic`), parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `/project:address-review`.**

## Constraints

- **Spec is authoritative.** Don't question DSL design decisions — that's `/project:review-quality-dsl-spec`.
- **Sub-agents are scoped by topic, not by artifact.** Every sub-agent reads both spec sections and parser code for its topic.
- **Run `twf parse`, don't just read code.** Actual behavior may differ from what the code suggests.
- **Incorrect is worse than missing.** A construct that silently parses wrong is more dangerous than one that fails with a clear error.
