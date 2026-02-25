# Align Design Skill to Parser (Constructs, Errors, AST)

This command answers: "does the design skill accurately and completely document what the parser actually accepts, emits, and rejects?"

The parser is the ground truth — not `LANGUAGE_SPEC.md`. The spec and parser are kept in sync separately via `/project:review-alignment-parser`. The skill must reflect reality: what the parser parses, what errors it emits, what the resulting AST means.

Skill craft and structure belong in `/project:review-quality-skill`. This command is solely alignment: does the skill document everything the parser provides?

## Context

- `tools/lsp/parser/` (`lexer/`, `parser/`, `ast/`, `resolver/`) — authoritative source
- `skills/design/README.md` — declared goal and scope of the skill
- `skills/design/SKILL.md` and `skills/design/reference/` — the target under review
- `AST_REVISIONS.md` — changes in flight that may introduce new constructs requiring pre-emptive documentation
- All existing files in `changes/design-skill/` — both `*_REVISIONS_*.md` and `CHANGES_*.md` — to avoid re-reporting known gaps or already-addressed issues

## Workflow

### Phase 1: Orient

Briefly scan the parser directory structure and the design skill's reference file list. Confirm the comparison units below still apply — add topics for new parser constructs not yet in the list, drop topics for removed ones. Note any `.twf` example files in `skills/design/topics/` that should be validated.

**Standard comparison units:**

| # | Topic | Source (parser) | Target (design skill) |
|---|-------|-----------------|----------------------|
| 1 | Definition registry (Workflow, Activity, NexusService) | `parser/definitions.go`, `nexus.go`; WorkflowDef/ActivityDef/NexusServiceDef in `ast/ast.go`; dup resolver errors | `notation-reference.md`, `notation-examples.md`, `primitives-reference.md` |
| 2 | Handler declarations (signal, query, update) | `parser/definitions.go` parseSignalDecl/parseQueryDecl/parseUpdateDecl; body context restrictions; `ErrUndefinedSignal`, `ErrUndefinedUpdate` | `signals-queries-updates.md`, `common-errors.md` |
| 3 | Async operations & promises | `statements_async.go` parsePromiseStmt/parseAsyncTarget; all 7 AsyncTarget types in `ast/ast.go`; `ErrUndefinedPromiseOrCondition`, `ErrConditionResultBinding`, and related | `promises-conditions.md`, `notation-reference.md` |
| 4 | Control flow (if, for, switch, break, continue, return) | `statements_control.go`, `statements_misc.go`; IfStmt/ForStmt/SwitchBlock/BreakStmt/ContinueStmt/ReturnStmt | `notation-reference.md` (32–36), `notation-examples.md` (64–106) |
| 5 | Async coordination (await, await all, await one) | `statements_async.go` parseAwaitStmt/parseAwaitAllBlock/parseAwaitOneBlock; AwaitStmt/AwaitAllBlock/AwaitOneBlock/AwaitOneCase | `notation-reference.md` (21–26), `promises-conditions.md` |
| 6 | State & conditions | `parser/definitions.go` parseStateBlock; `statements_misc.go` parseSetStmt/parseUnsetStmt; resolver condition map; `ErrUndefinedCondition`, `ErrConditionResultBinding` | `promises-conditions.md`, `notation-reference.md` (15–18), `common-errors.md` |
| 7 | Nexus & cross-namespace communication | `parser/nexus.go` parseNexusTopLevel/parseAsyncOperation/parseSyncOperation; NexusServiceDef/NexusCall/NexusTarget; 6 nexus resolver errors | `nexus.md`, `common-errors.md` (35–43) |
| 8 | Worker & namespace infrastructure | `workers.go`, `namespaces.go`, `options.go`; WorkerDef/NamespaceDef; all option schemas; 7+ resolver errors | `task-queues.md`, `notation-reference.md` (43–46), `common-errors.md` |
| 9 | Error handling & validation (complete catalog) | All 17+ `ErrorKind` constants in `resolver/resolver.go`; parse-level body context restrictions; warning kinds | `common-errors.md`, `anti-patterns.md` |

### Phase 2: Parallel Alignment

Launch one sub-agent per topic. Each sub-agent reads the relevant **parser code AND the corresponding design skill sections** for its topic, then answers:

- Is this construct documented in the skill? (`documented` / `partial` / `missing`)
- Is the documentation accurate — does it match what the parser actually does?
- Is there skill content describing behavior the parser doesn't support? (stale)
- Do the `.twf` examples for this topic pass `twf check`?

Sub-agents run in parallel. **Every sub-agent reads both sides** — parser code and skill documentation — for its topic.

### Phase 3: Catalog

Merge all findings. For each issue:
- **Status**: `documented` | `partial` | `missing` | `stale`
- **Gap**: what's absent, inaccurate, or outdated
- **Severity**: `critical` (common construct or frequent error, undocumented) | `moderate` | `minor`

Drop anything already tracked in existing `changes/design-skill/*_REVISIONS_*.md` or `changes/design-skill/CHANGES_*.md` files.

### Phase 4: Group & Prioritize

Group by construct family. Order: stale content first (actively misleads users), then missing critical constructs, then partial coverage, then minor gaps.

### Phase 5: Write to `changes/design-skill/alignment_REVISIONS_{NNN}.md`

Write the grouped plan to `changes/design-skill/alignment_REVISIONS_{NNN}.md` (create the `changes/design-skill/` directory if needed). Use `_001` as the default sequence number; if `_001` already exists, increment to `_002`, etc.
- Brief summary: coverage state, stale content found, `twf check` result summary
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Internal`), parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `/project:address-review`.**

## Constraints

- **Parser is authoritative.** If the skill documents something the parser doesn't support, flag it for removal — not for parser addition.
- **Sub-agents are scoped by topic, not by artifact.** Every sub-agent reads both parser code and skill docs for its topic.
- **Run `twf check` on all examples.** Don't trust example correctness by reading alone.
- **Prefer improving existing examples over creating new ones.** More docs ≠ better docs.
- **Don't modify the parser.** If a gap reveals a parser deficiency, note it for `/project:review-alignment-parser`, don't fix it here.
