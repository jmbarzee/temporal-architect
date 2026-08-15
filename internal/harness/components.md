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
| `sampler` | `tools/sampler/` | `internal/changes/sampler/` | `review-quality-sampler` | — | — (leaf) |
| `skills` | `skills/` | `internal/changes/skills/` | `review-quality-skill` (per skill) | `review-alignment-design-skill`, `review-alignment-author-skills` | — (leaf) |

`sampler` (`tools/sampler/`) is a **leaf consumer of `parser`**, not a schema owner. The
observed-graph wire shape is `observe.ObservedGraph`, which lives in `tools/lsp/parser/observe` —
`tools/sampler/go.mod` requires `tools/lsp` and `main.go` imports it. The sampler *produces
instances* of a shape the parser *defines*, so a change to that shape originates in `parser` and
must reach **both** consumers: the visualizer, which projects it, and the sampler, which emits it.
That second edge is the one this component exists to make visible.

The skill set — design, the two authors, and the `temporal-architect` harness front-door — is **one
component**. Its members have dependencies flowing in many internal directions (design ↔ authors ↔
harness), so those edges are **intra-component**, not modeled in the DAG. The skills are downstream; the
only inbound edge is from `parser`.

All skill reviews share the single `internal/changes/skills/` directory, so the `{type}` token in the
`{type}_REVISIONS_{NNN}.md` naming convention is **source-encoded** to keep concurrent reviews from
colliding: quality reviews write `quality-{skill}_REVISIONS_{NNN}.md` (`quality-design`,
`quality-author-go`, `quality-author-infra`, `quality-architect`); alignment reviews write
`alignment-design_REVISIONS_{NNN}.md` and `alignment-author_REVISIONS_{NNN}.md`. `address-review` still
merges every `internal/changes/skills/*_REVISIONS_*.md` into one sequence and writes a single
`skills/CHANGES_{NNN}.md`.

`internal/changes/orchestrator/` is **not** a cycle component — it is coordination scratch for the
orchestrator's own design and is excluded.

## Routing an issue to a component

`/dev-issue` needs to map a GitHub issue onto a component. The `area:*` labels do **not** map 1:1,
so this table is the starting point and the *files the work touches* are the decider.

| Label | Usually | Because |
|---|---|---|
| `area:dsl` | `dsl` | The spec is `tools/spec/sections/`. The parser half of any grammar change is a `dsl` → `parser` propagation, not part of the issue's own component. |
| `area:parser` | `parser` | `tools/lsp/`. |
| `area:cli` | `parser` | The CLI lives at `tools/lsp/cmd/twf/` — inside the parser's scope. |
| `area:decompose` | `parser` | The engine is `tools/lsp/parser/decompose/`. |
| `area:visualizer` | `visualizer` or `visualizer-spec` | Split by whether the work lands in `spec/`. |
| `area:sampler` | `sampler` | `tools/sampler/`. |
| `area:skills` | `skills` | `skills/`. |
| `area:orchestrator` | **none** | `internal/orchestrator/` is excluded above. These issues are handled by hand. |

Four ways the label misleads, each of which has actually happened:

- **`area:decompose` is not always a component signal.** It sometimes means "about the decomposition
  feature" — several such issues are pure visualizer overlay work with no `parser/decompose/` change.
- **A single label can hide cross-component work.** An issue labelled only `area:sampler` that changes
  a type in `tools/lsp/parser/observe/` is a `parser` **Schema** change fanning out to every consumer.
- **`visualizer-spec` is unreachable from labels.** No `area:*` label maps to `tools/visualizer/spec/`,
  so that pickup has to come from reading the body.
- **A label can point at the wrong repository.** Work whose body describes a VS Code extension command
  belongs to `jmbarzee/temporal-architect-dist`, whatever it is labelled here.

Issues migrated from the old in-repo backlog carry a `<!--PROVENANCE-->` footer naming the file they
came from, which is a stronger signal than the label. Two of those paths are workstreams rather than
components: `temp-change-set/chunks` → `parser`, `temp-change-set/reverse-history` → `sampler`.

## Propagation routing

When a component's `CHANGES` file is propagated, each non-`Internal` change type triggers a
specific review in the downstream component (transcribed for `propagate-changes`). `Internal`
changes never propagate.

**This table is a floor, not the whole map.** It encodes the edges that are always true, so an
author who forgets a consumer is still caught. It cannot know a specific obligation — *"the
author-go skill needs a reference file for this construct"* — because that depends on the change,
not on the graph. So a CHANGES record's `## Downstream propagation` section is **authoritative
beyond this table**: a component named there gets a review even with no edge here, and its review
prompt comes from the Components table above. Both directions of mismatch are reported by
`propagate-changes`, and neither silently wins.

| Source | Change type | Triggers (downstream → review) |
|---|---|---|
| `dsl` | Grammar | `parser` → `review-alignment-parser` |
| `parser` | Grammar | `skills` → `review-alignment-design-skill` |
| `parser` | Schema | `visualizer` → `review-quality-visualizer`; `visualizer-spec` → `review-quality-visualizer-spec`; `sampler` → `review-quality-sampler` |
| `parser` | API | `visualizer` → `review-quality-visualizer` (TS types); `sampler` → `review-quality-sampler` |
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
Wave 2: visualizer-spec, visualizer, skills, sampler
```

`sampler` joins Wave 2 as a leaf: it depends only on `parser`, and nothing depends on it.

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
