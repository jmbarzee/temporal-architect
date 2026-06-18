# Align Design Skill to Parser (Constructs, Errors, AST)

This command answers: "does the design skill accurately and completely document what the parser actually accepts, emits, and rejects?"

The spec (`tools/spec/sections/`) is the design authority — the canonical flow changes the spec first, then propagates to the parser via `.claude/skills/dev-cycle/references/review-alignment-parser.md`. The skill, though, teaches `.twf` that authors run through `twf check` today, so it must also track what the parser currently parses, the errors it emits, and what the resulting AST means. In practice the two agree; when they diverge it is usually because the parser has not yet caught up to a recent spec change. Treat the spec as the source of intent and the parser as the source of current reality — and when they conflict, identify which one is ahead rather than assuming the skill is at fault.

Skill craft and structure belong in `.claude/skills/dev-cycle/references/review-quality-skill.md`. This command is solely alignment: does the skill document everything the parser provides?

## Context

- `tools/spec/sections/*.md` — the design authority (what the DSL is *meant* to do); consult when the parser and skill diverge to tell whether the parser is simply behind
- `tools/lsp/parser/` (`lexer/`, `parser/`, `ast/`, `resolver/`) — current parser behavior (what `twf check` accepts, emits, and rejects today)
- `skills/temporal-architect-design/README.md` — declared goal and scope of the skill
- `skills/temporal-architect-design/SKILL.md` and `skills/temporal-architect-design/reference/` — the target under review
- in-flight files in `internal/changes/` (especially `dsl/` and `parser/`) — changes in flight that may introduce new constructs requiring pre-emptive documentation
- All existing files in `internal/changes/skills/` — both `*_REVISIONS_*.md` and `CHANGES_*.md` — to avoid re-reporting known gaps or already-addressed issues

## Workflow

### Phase 1: Orient

Briefly scan the parser directory structure and the design skill's reference file list. Confirm the comparison units below still apply — add topics for new parser constructs not yet in the list, drop topics for removed ones. Note any `.twf` example files in `skills/temporal-architect-design/topics/` that should be validated.

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
- Is there skill content describing behavior the parser doesn't support? If the spec defines it, the parser is likely just behind (a parser-alignment gap, not skill rot); if neither the spec nor the parser supports it, it is stale.
- Do the `.twf` examples for this topic pass `twf check`?

Sub-agents run in parallel. **Every sub-agent reads both sides** — parser code and skill documentation — for its topic.

### Phase 3: Catalog

Merge all findings. For each issue:
- **Status**: `documented` | `partial` | `missing` | `stale`
- **Gap**: what's absent, inaccurate, or outdated
- **Severity**: `critical` (common construct or frequent error, undocumented) | `moderate` | `minor`

Drop anything already tracked in existing `internal/changes/skills/*_REVISIONS_*.md` or `internal/changes/skills/CHANGES_*.md` files.

### Phase 4: Group & Prioritize

Group by construct family. Order: stale content first (actively misleads users), then missing critical constructs, then partial coverage, then minor gaps.

### Phase 5: Write to `internal/changes/skills/alignment-design_REVISIONS_{NNN}.md`

Write the grouped plan to `internal/changes/skills/alignment-design_REVISIONS_{NNN}.md` (create the `internal/changes/skills/` directory if needed). The filename is source-encoded (`alignment-design`) because all skills share the single `skills` component directory. Use `_001` as the default sequence number; if `_001` already exists, increment to `_002`, etc.
- Brief summary: coverage state, stale content found, `twf check` result summary
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Internal`), parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `.claude/skills/dev-cycle/references/address-review.md`.**

## Constraints

- **Spec is the design authority; the parser is current reality.** If the skill documents something the parser doesn't support, check the spec first: if the spec defines it, that's a parser gap — route it to `.claude/skills/dev-cycle/references/review-alignment-parser.md` and keep the content (but don't imply `twf check` accepts it yet) rather than deleting it. Only flag content for removal when neither the spec nor the parser supports it (genuinely stale).
- **Sub-agents are scoped by topic, not by artifact.** Every sub-agent reads both parser code and skill docs for its topic.
- **Run `twf check` on all examples.** Don't trust example correctness by reading alone.
- **Prefer improving existing examples over creating new ones.** More docs ≠ better docs.
- **Don't modify the parser.** If a gap reveals a parser deficiency, note it for `.claude/skills/dev-cycle/references/review-alignment-parser.md`, don't fix it here.
