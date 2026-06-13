# Design Skill Changes

**Source review(s):** `review-alignment-design-skill` (propagated from `internal/changes/dsl/CHANGES_005.md` — Worker Options extended to the SDK union + `versioning` strategy key)
**REVISIONS file(s):** `internal/changes/design-skill/REVISIONS_001.md`

## Summary

Taught the design skill the new worker-instantiation options: the headline `versioning` strategy key at design altitude, and the spec's "SDK union, accepted permissively, express strategy/intent not numeric tuning" framing. No new exhaustive numeric-tuning catalog — the skill points to `twf spec` / the spec section for the full key list.

## Changes by Type

### Internal

- **`skills/temporal-architect-design/topics/versioning.md`** — under "Worker Versioning (Build IDs)", added a "Declaring the strategy in `.twf`" subsection: a TWF-vs-SDK callout, a namespace example with `versioning: build_id`, the `none`/`build_id`/`deployment` value table, and the bare-ident note (`build_id`, not `build-id`/`"build_id"`). Frames the `.twf` key as design-altitude *intent*; SDK/CLI mechanics stay code-scale.
- **`skills/temporal-architect-design/topics/versioning.twf`** — extended the `namespace versioning` worker block with `versioning: build_id` alongside `task_queue` (passes `twf check`).
- **`skills/temporal-architect-design/topics/task-queues.md`** — replaced the vague "(task queue, concurrency limits, etc.)" framing with a new "Worker Options" subsection: the set is the SDK union accepted permissively, for strategy/intent at altitude not numeric ops tuning; calls out `versioning` (links to versioning.md) and `enable_sessions` as design-relevant decisions, frames concurrency caps/rate limiters as ops tuning, and defers the full key list to `twf spec` / `tools/spec/sections/03-workers-and-namespaces.md`.
- **`skills/temporal-architect-design/reference/notation-reference.md`** — added a note under "Common `options:` Keys" clarifying that worker-instantiation `options:` are a separate set from call options, with `task_queue` required and `versioning` as the design-altitude strategy key; defers the union to the spec.

## Validation

`twf check` passes on `topics/versioning.twf` and `topics/task-queues.twf` (rebuilt `twf` with the landed worker-options schema). Markdown lint clean.
