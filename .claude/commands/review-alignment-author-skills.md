# Author Skills Alignment Review

Align author-go (and any future author-* skills) to the design skill and the Temporal SDK. Both are authoritative — the author skill documentation is the target.

This command answers: "does the author-go skill provide a complete and accurate mapping from every design skill construct to correct, current Temporal Go SDK code?"

Skill craft belongs in `/project:review-quality-skill`. This command is solely coverage and accuracy alignment across two authoritative sources.

## Context

- `skills/design/SKILL.md` and `skills/design/reference/` — authoritative: every construct the design skill can produce
- Temporal Go SDK via **Temporal docs MCP server** — authoritative: current SDK API, patterns, and idioms
- `skills/author-go/README.md` — declared scope of the skill
- `skills/author-go/SKILL.md` and `skills/author-go/reference/` — the target under review
- `AST_REVISIONS.md` — changes in flight that may introduce new design constructs requiring new Go mappings
- `AUTHOR_SKILLS_ALIGNMENT_REVISIONS.md` — if present, read to avoid re-reporting known gaps

## Dependencies to Check

The author-go skill has two authoritative dependencies, both must be satisfied:

1. **Design skill coverage**: every construct the design skill produces must have a corresponding Go mapping — workflows, activities, workers, namespaces, nexus services, all statement types, all options, all async patterns
2. **SDK accuracy**: every Go mapping must reflect the current Temporal Go SDK — correct types, function signatures, context propagation, determinism constraints, error handling patterns

## Workflow

### Phase 1: Explore

Use sub-agents in parallel:
- **Design skill agent**: Read `skills/design/SKILL.md` and all `skills/design/reference/` files. Build a complete inventory of every construct and semantic the design skill documents.
- **SDK agent**: Use the Temporal docs MCP server to inventory the current Go SDK surface relevant to the design skill constructs: workflow registration, activity registration, signal/query/update handlers, timers, promises, child workflows, nexus, heartbeats, task queues, workers.
- **Author skill agent**: Read `skills/author-go/SKILL.md` and all `skills/author-go/reference/` files. For each design construct and SDK pattern, determine: mapped, partial, missing, or incorrect?

### Phase 2: Catalog

For each design construct:
- **Design coverage**: `mapped` | `partial` | `missing` — does a Go mapping exist?
- **SDK accuracy**: `current` | `outdated` | `incorrect` — does the mapping match the actual SDK?
- **Gap**: what's absent, stale, or wrong
- **Severity**: `critical` (common construct unmapped, or SDK usage that would produce broken code) | `moderate` | `minor`

### Phase 3: Group & Prioritize

Group by construct family. Order: incorrect SDK usage first (produces broken code), then missing mappings for common constructs, then coverage gaps, then minor accuracy issues.

### Phase 4: Write to `AUTHOR_SKILLS_ALIGNMENT_REVISIONS.md`

Write the grouped plan to `AUTHOR_SKILLS_ALIGNMENT_REVISIONS.md` at the repo root:
- Brief summary: coverage state, SDK accuracy state
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Internal`), parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `/project:address-review`.**

## Constraints
- **Both authorities must be satisfied.** A mapping that exists but uses outdated SDK is as broken as a missing mapping.
- **Use the Temporal docs MCP server.** Don't evaluate SDK accuracy from memory — the SDK evolves.
- **Incorrect mappings before missing ones.** Wrong guidance actively harms users; missing guidance is a gap they can work around.
- **Don't redesign the DSL or change the design skill.** If a design construct has no clean Go mapping, flag it for discussion — don't invent a workaround.
- **Future author-* skills**: if other author skills exist (e.g., `author-typescript`), run a parallel sub-agent for each using the same rubric against the relevant SDK.
