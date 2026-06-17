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
| `parser` | `tools/lsp/` | `internal/changes/parser/` | `review-quality-parser` | `review-alignment-parser` | `visualizer` [Schema, API], `visualizer-spec` [Schema], `skills` [Grammar, Semantic] |
| `visualizer-spec` | `tools/visualizer/spec/` | `internal/changes/visualizer-spec/` | `review-quality-visualizer-spec` | — | `visualizer` [Spec] |
| `visualizer` | `tools/visualizer/` (excluding `spec/`) | `internal/changes/visualizer/` | `review-quality-visualizer` | `review-alignment-visualizer`, `review-alignment-parser-visualizer` | — (leaf) |
| `skills` | `skills/` | `internal/changes/` (per-skill subdirs: `design-skill/`, `author-go-skill/`, `author-infra-skill/`, `harness-skill/`) | `review-quality-skill` (per skill) | `review-alignment-design-skill`, `review-alignment-author-skills` | — (leaf) |

The skill set — design, the two authors, and the `temporal-architect` harness front-door — is **one
component**. Its members have dependencies flowing in many internal directions (design ↔ authors ↔
harness), so those edges are **intra-component**, not modeled in the DAG. The skills are downstream; the
only inbound edge is from `parser`.

`internal/changes/orchestrator/` is **not** a cycle component — it is coordination scratch for the
orchestrator's own design and is excluded.

## Propagation routing

When a component's `CHANGES` file is propagated, each non-`Internal` change type triggers a
specific review in the downstream component (transcribed for `propagate-changes`). `Internal`
changes never propagate.

| Source | Change type | Triggers (downstream → review) |
|---|---|---|
| `dsl` | Grammar | `parser` → `review-alignment-parser` |
| `parser` | Grammar | `skills` → `review-alignment-design-skill` |
| `parser` | Schema | `visualizer` → `review-quality-visualizer`; `visualizer-spec` → `review-quality-visualizer-spec` |
| `parser` | API | `visualizer` → `review-quality-visualizer` (TS types) |
| `parser` | Semantic | `skills` → `review-alignment-design-skill` |
| `visualizer-spec` | Spec | `visualizer` → `review-alignment-visualizer` |

Design → author propagation is now **intra-component** (within `skills`) and no longer a DAG edge: a
design change still triggers `review-alignment-author-skills`, but as part of the `skills` component's
own review sweep rather than cross-component propagation. Leaves (`visualizer`, `skills`) terminate
propagation.

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
Wave 2: visualizer-spec, visualizer, skills
```

`skills` depends only on `parser`/`dsl` (Wave 1); the former per-skill waves collapse into the single
`skills` node. Intra-`skills` ordering (design before authors before harness) is handled inside the
component's own review sweep, not by the cross-component wave order.

## Cross-repo seam (distribution repo)

The VS Code/Cursor extension and every registry package live in the distribution repo
(`jmbarzee/temporal-architect-dist`), not here. Parser `Schema`/`API` changes reach the
extension only through the **wire-types contract**, which is generated from the Go DTOs and
gated in-tree by `make check-types` (and exercised by `review-quality-visualizer`). The
distribution repo consumes that contract as the published, version-pinned
`@temporal-architect/wire-types@X.Y.Z` package.

The only cross-repo edge is therefore a **version bump, not a schema diff**: when dist bumps
to a new toolchain release, its extension-only dev-cycle re-pins the wire-types/visualizer
version. That review lives in the dist repo and is out of scope for this manifest.
