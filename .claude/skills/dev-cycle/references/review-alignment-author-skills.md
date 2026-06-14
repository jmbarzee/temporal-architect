# Align Author-Go Skill to Design Skill + Temporal SDK

This command answers: "does the author-go skill provide a complete and accurate mapping from every design skill construct to correct, current Temporal Go SDK code?"

Both sources are authoritative — a mapping that exists but uses an outdated SDK call is as broken as a missing mapping.

Skill craft belongs in `.claude/skills/dev-cycle/references/review-quality-skill.md`. This command is solely coverage and accuracy alignment across two authoritative sources.

## Context

- `skills/temporal-architect-design/SKILL.md` and `skills/temporal-architect-design/reference/` — authoritative: every construct the design skill can produce
- Temporal Go SDK via **Temporal docs MCP server** (`mcp__temporal-docs__search_temporal_knowledge_sources`) — authoritative: current SDK API, patterns, and idioms
- `skills/temporal-architect-author-go/README.md` — declared scope of the skill
- `skills/temporal-architect-author-go/SKILL.md` and `skills/temporal-architect-author-go/reference/` — the target under review
- in-flight files in `internal/changes/` (especially `parser/` and `design-skill/`) — changes in flight that may introduce new design constructs requiring new Go mappings
- All existing files in `internal/changes/author-go-skill/` — both `*_REVISIONS_*.md` and `CHANGES_*.md` — to avoid re-reporting known gaps or already-addressed issues

## Workflow

### Phase 1: Orient

Briefly scan the design skill reference file list and the author-go reference file list. Confirm the comparison units below still apply — add topics for new design constructs with no author-go coverage, drop topics for constructs that no longer exist. Note which topics will need Temporal docs MCP server lookups to verify SDK accuracy.

**Standard comparison units:**

| # | Topic | Source (design skill + SDK concept) | Target (author-go) |
|---|-------|-------------------------------------|-------------------|
| 1 | Workflow definition & signatures | `notation-reference.md`, `primitives-reference.md`; SDK: `workflow.Context`, workflow function signatures, error returns | `workflow-def.md` |
| 2 | Activity definition & execution boundaries | `core-principles.md`, `notation-reference.md`; SDK: `context.Context`, `RegisterActivity`, struct method pattern | `activity-def.md` |
| 3 | Activity calls (sync & promise) | `notation-reference.md`, `notation-examples.md`; SDK: `ExecuteActivity`, `workflow.Future`, `.Get()` | `activity-call.md`, `promise.md` |
| 4 | Child workflow execution (sync, promise, detach) | `topics/child-workflows.md`; SDK: `ExecuteChildWorkflow`, `ChildWorkflowOptions`, `ParentClosePolicy.ABANDON` | `workflow-call.md`, `promise.md`, `detach.md` |
| 5 | Signal handlers & ambient reception | `topics/signals-queries-updates.md`; SDK: `GetSignalChannel`, `workflow.Go`, `ReceiveChannel` looping pattern | `signal-handler.md`, `await-one.md` |
| 6 | Query & update handlers | `topics/signals-queries-updates.md`; SDK: `SetQueryHandler`, `SetUpdateHandlerWithOptions`, `UpdateHandlerOptions` | `query-handler.md`, `update-handler.md` |
| 7 | Timers & conditions | `topics/timers-scheduling.md`, `topics/promises-conditions.md`; SDK: `workflow.Sleep`, `workflow.Await`, `workflow.NewTimer` | `await-timer.md`, `condition.md` |
| 8 | Await all / await one (selector patterns) | `notation-examples.md`, `topics/promises-conditions.md`; SDK: `workflow.Go`, `workflow.NewSelector`, `AddFuture`, `AddReceive` | `await-all.md`, `await-one.md` |
| 9 | Activity options, retry & timeouts | `topics/activities-advanced.md`; SDK: `ActivityOptions`, `RetryPolicy`, `WithActivityOptions` | `options.md`, `activity-call.md` |
| 10 | Nexus operations & service definitions | `topics/nexus.md`; SDK: `workflow.NewNexusClient`, `ExecuteOperation`, `temporalnexus.NewWorkflowRunOperation`, `RegisterNexusService` | `nexus.md`, `nexus-service-def.md`, `worker.md` |
| 11 | Control flow (if, for, switch) | `notation-reference.md`, `notation-examples.md`; direct Go mapping + determinism constraints | `control-flow.md` |
| 12 | Workflow termination & continuation | `topics/long-running.md`; SDK: `workflow.NewContinueAsNewError`, error return patterns | `close.md` |

### Phase 2: Parallel Alignment

Launch one sub-agent per topic. Each sub-agent reads the relevant **design skill sections AND the author-go sections** for its topic, **and searches the Temporal docs MCP server** for the current SDK API for that topic, then answers:

- Is this DSL construct mapped in author-go? (`mapped` / `partial` / `missing`)
- Is the mapping accurate to the current SDK? (`current` / `outdated` / `incorrect`)
- Are all DSL variants covered (e.g., all three execution modes for child workflows)?
- Does the Go code in the skill use the correct SDK functions and call signatures?

Sub-agents run in parallel. **Every sub-agent reads both sides** — design skill and author-go — AND queries the Temporal docs MCP server for its topic.

### Phase 3: Catalog

Merge all findings. For each issue:
- **Design coverage**: `mapped` | `partial` | `missing`
- **SDK accuracy**: `current` | `outdated` | `incorrect`
- **Gap**: what's absent, stale, or wrong
- **Severity**: `critical` (common construct unmapped, or SDK usage that would produce broken code) | `moderate` | `minor`

Drop anything already tracked in existing `internal/changes/author-go-skill/*_REVISIONS_*.md` or `internal/changes/author-go-skill/CHANGES_*.md` files.

### Phase 4: Group & Prioritize

Group by construct family. Order: incorrect SDK usage first (produces broken code), then missing mappings for common constructs, then coverage gaps, then minor accuracy issues.

### Phase 5: Write to `internal/changes/author-go-skill/alignment_REVISIONS_{NNN}.md`

Write the grouped plan to `internal/changes/author-go-skill/alignment_REVISIONS_{NNN}.md` (create the `internal/changes/author-go-skill/` directory if needed). Use `_001` as the default sequence number; if `_001` already exists, increment to `_002`, etc.
- Brief summary: coverage state, SDK accuracy state
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Internal`), parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `.claude/skills/dev-cycle/references/address-review.md`.**

## Constraints

- **Both authorities must be satisfied.** A mapping that exists but uses an outdated SDK is as broken as a missing mapping.
- **Use the Temporal docs MCP server.** Don't evaluate SDK accuracy from memory — the SDK evolves.
- **Sub-agents are scoped by topic, not by artifact.** Every sub-agent reads both design skill and author-go, and queries the SDK.
- **Incorrect SDK mappings before missing ones.** Wrong guidance actively harms users; missing guidance is a gap they can work around.
- **Don't redesign the DSL or change the design skill.** If a design construct has no clean Go mapping, flag it — don't invent a workaround.
- **Prefer improving existing examples over creating new ones.** More docs ≠ better docs.
