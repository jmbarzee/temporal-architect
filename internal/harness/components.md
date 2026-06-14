# Dev-Cycle Component Manifest

Single source of truth for the dev-cycle graph: the components, their source scopes,
coordination directories, review prompts, and how changes propagate downstream.

This file is consumed by:
- the dev-cycle harness skill loop (`.claude/skills/dev-cycle/SKILL.md`), and
- the durable twin (`internal/orchestrator/dev-cycle.twf`).

Keep the graph here and only here. `AGENTS.md`, the orchestrator README, and the step
prompts should point at this file rather than restating the graph.

Review prompts referenced below live at `.claude/skills/dev-cycle/references/<name>.md`.

## Components

| Component | Source scope | Coordination dir | Quality review | Alignment review(s) | Downstream (contract types) |
|---|---|---|---|---|---|
| `dsl` | `tools/spec/sections/` | `internal/changes/dsl/` | `review-quality-dsl-spec` | — | `parser` [Grammar] |
| `parser` | `tools/lsp/` | `internal/changes/parser/` | `review-quality-parser` | `review-alignment-parser` | `visualizer` [Schema, API], `visualizer-spec` [Schema], `design-skill` [Grammar, Semantic], `vscode` [Schema, API — manual] |
| `visualizer-spec` | `tools/visualizer/spec/` | `internal/changes/visualizer-spec/` | `review-quality-visualizer-spec` | — | `visualizer` [Spec] |
| `visualizer` | `tools/visualizer/` (excluding `spec/`) | `internal/changes/visualizer/` | `review-quality-visualizer` | `review-alignment-visualizer`, `review-alignment-parser-visualizer` | — (leaf) |
| `design-skill` | `skills/temporal-architect-design/` | `internal/changes/design-skill/` | `review-quality-skill` | `review-alignment-design-skill` | `author-go-skill` [Grammar, Semantic], `author-infra-skill` [Grammar, Semantic] |
| `author-go-skill` | `skills/temporal-architect-author-go/` | `internal/changes/author-go-skill/` | `review-quality-skill` | `review-alignment-author-skills` | — (leaf) |
| `author-infra-skill` | `skills/temporal-architect-author-infra/` | `internal/changes/author-infra-skill/` | `review-quality-skill` | `review-alignment-author-skills` | — (leaf) |

`internal/changes/orchestrator/` and `internal/changes/harness-skill/` are **not** cycle
components — they are coordination scratch for the harness's own design and are excluded.

## Propagation routing

When a component's `CHANGES` file is propagated, each non-`Internal` change type triggers a
specific review in the downstream component (transcribed for `propagate-changes`). `Internal`
changes never propagate.

| Source | Change type | Triggers (downstream → review) |
|---|---|---|
| `dsl` | Grammar | `parser` → `review-alignment-parser` |
| `parser` | Grammar | `design-skill` → `review-alignment-design-skill` |
| `parser` | Schema | `visualizer` → `review-quality-visualizer`; `visualizer-spec` → `review-quality-visualizer-spec` |
| `parser` | API | `visualizer` → `review-quality-visualizer` (TS types); `vscode` → manual |
| `parser` | Semantic | `design-skill` → `review-alignment-design-skill` |
| `visualizer-spec` | Spec | `visualizer` → `review-alignment-visualizer` |
| `design-skill` | Grammar, Semantic | `author-go-skill` → `review-alignment-author-skills`; `author-infra-skill` → `review-alignment-author-skills` |

Leaves (`visualizer`, `author-go-skill`, `author-infra-skill`) terminate propagation.

## Contract types

| Type | Meaning |
|---|---|
| `Grammar` | DSL syntax changes |
| `Schema` | JSON output shape changes |
| `API` | Go type or interface changes |
| `Semantic` | Behavior changes with no signature change |
| `Spec` | Product/UX spec changes (spec-only layers: `dsl`, `visualizer-spec`) |
| `Internal` | Refactors with no downstream contract impact — never propagates |

## Wave ordering (dependency DAG)

Process upstream before downstream so a downstream review isn't invalidated by an
upstream change landing later:

```
Wave 1: dsl, parser
Wave 2: visualizer-spec, visualizer, design-skill
Wave 3: author-go-skill, author-infra-skill
```

`vscode` (`packages/vscode/`) has no automated review command; parser Schema/API changes
that reach it are flagged for manual review.
