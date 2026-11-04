# Align an Author Skill to Design Skill + Temporal SDK

This command takes a language `{lang}` — one of the authors listed in `internal/harness/components.md` § Authors — and answers: "does `skills/temporal-architect-author-{lang}` provide a complete and accurate mapping from every design skill construct to correct, current Temporal `{lang}` SDK code?"

Both sources are authoritative — a mapping that exists but uses an outdated SDK call is as broken as a missing mapping.

Skill craft belongs in `.claude/skills/dev-cycle/references/review-quality-skill.md`. This command is solely coverage and accuracy alignment across two authoritative sources.

## Context

- `tools/spec/sections/` — the constructs, by section
- `skills/temporal-architect-design/SKILL.md` and `skills/temporal-architect-design/reference/` — authoritative: every construct the design skill can produce
- The Temporal `{lang}` SDK via the **Temporal docs MCP server** (`mcp__temporal-docs__search_temporal_knowledge_sources`) — authoritative: current SDK API, patterns, and idioms
- `skills/temporal-architect-author-{lang}/README.md` — declared scope of the skill
- `skills/temporal-architect-author-{lang}/SKILL.md` and its `reference/` — the target under review; its reference index maps constructs to files
- in-flight files in `internal/changes/` (especially `parser/` and `skills/`) — changes in flight that may introduce new design constructs requiring new mappings
- All existing files in `internal/changes/skills/` — both `*_REVISIONS_*.md` and `CHANGES_*.md` — to avoid re-reporting known gaps or already-addressed issues

## Workflow

### Phase 1: Orient

Scan the spec section list, the design skill reference files, and the author's reference index. Confirm the comparison units below still apply — add a construct the spec gained, drop one it lost — and map each unit to the author files that cover it.

**Standard comparison units:**

| # | Construct | Spec section |
|---|-----------|--------------|
| 1 | Workflow definition, ID scheme, state | `01-workflows` |
| 2 | Signal, query, and update handlers | `01-workflows` § Signal/Query/Update Declarations |
| 3 | Activity definition and heartbeat | `02-activities`, `06-statement-syntax` § Heartbeat |
| 4 | Workers and namespaces | `03-workers-and-namespaces` |
| 5 | Nexus services and calls | `04-nexus`, `06-statement-syntax` § Nexus Call |
| 6 | Activity and workflow calls, promises | `06-statement-syntax` § Activity Call, Workflow Call, Promise Statement |
| 7 | Options and definition defaults | `06-statement-syntax` § Options Block, Definition Default Options |
| 8 | Signal send | `06-statement-syntax` § Signal Send, `13-cross-workflow-signals` |
| 9 | Await, await all, await one | `06-statement-syntax` § Single Await Statement, Await All Block, Await One Block |
| 10 | Control flow and state mutation | `06-statement-syntax` § Switch, If, For, Break and Continue, Set / Unset, Assignment |
| 11 | Close and return | `06-statement-syntax` § Close Statement, Return Statement |

### Phase 2: Parallel Alignment

Launch one sub-agent per construct. Each reads the spec section, the design skill's coverage, and the author's files for its construct, **searches the Temporal docs MCP server** for the current `{lang}` SDK API, then answers:

- Is this DSL construct mapped in the author skill? (`mapped` / `partial` / `missing`)
- Is the mapping accurate to the current SDK? (`current` / `outdated` / `incorrect`)
- Are all DSL variants covered (e.g., all three execution modes for child workflows)?
- Does the skill's code use the correct SDK functions and call signatures?

### Phase 3: Catalog

Merge all findings. For each issue:
- **Design coverage**: `mapped` | `partial` | `missing`
- **SDK accuracy**: `current` | `outdated` | `incorrect`
- **Gap**: what's absent, stale, or wrong
- **Severity**: `critical` (common construct unmapped, or SDK usage that would produce broken code) | `moderate` | `minor`

Drop anything already tracked in existing `internal/changes/skills/*_REVISIONS_*.md` or `internal/changes/skills/CHANGES_*.md` files.

### Phase 4: Group & Prioritize

Group by construct family. Order: incorrect SDK usage first (produces broken code), then missing mappings for common constructs, then coverage gaps, then minor accuracy issues.

### Phase 5: Write to `internal/changes/skills/alignment-author-{lang}_REVISIONS_{NNN}.md`

Write the grouped plan to `internal/changes/skills/alignment-author-{lang}_REVISIONS_{NNN}.md` (create the `internal/changes/skills/` directory if needed). The filename is source-encoded because all skills share the single `skills` component directory. Use the sequence number the dispatching agent gave you. If none was given (a human running this directly), use `_001` and increment past any file that already exists.
- `**Source:**` immediately after the H1 — the upstream `CHANGES` path when this review was triggered by a propagation, `—` when it was not. Required; `propagate-changes` dedups on it. See `.claude/skills/dev-cycle/SKILL.md` § REVISIONS file contract.
- Brief summary: coverage state, SDK accuracy state
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Internal`), parallelism notes

**Return the REVISIONS file path and a one-line summary of each group.** Do not begin executing them — that is `.claude/skills/dev-cycle/references/address-review.md`, dispatched separately.

## Constraints

- **Both authorities must be satisfied.** A mapping that exists but uses an outdated SDK is as broken as a missing mapping.
- **Use the Temporal docs MCP server.** Don't evaluate SDK accuracy from memory — the SDK evolves.
- **Sub-agents are scoped by construct, not by file.** Every sub-agent reads the design skill and the author skill, and queries the SDK.
- **Incorrect SDK mappings before missing ones.** Wrong guidance actively harms users; missing guidance is a gap they can work around.
- **Don't redesign the DSL or change the design skill.** If a construct has no clean `{lang}` mapping, flag it — don't invent a workaround.
- **Prefer improving existing examples over creating new ones.** More docs ≠ better docs.
