# DSL Changes

**Source review(s):** skill-retro planning session (`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 3 — prioritized trio)
**REVISIONS file(s):** `internal/changes/dsl/REVISIONS_001.md` (Group 1 — Worker Options, union/parser-permissive)

## Summary

Extended the worker-instantiation option set to the SDK union (excluding per-language one-offs) and added the headline North-Star `versioning` strategy key. Options are accepted permissively with no per-language validation. Coordinated with `internal/changes/parser/CHANGES_003.md`.

## Changes by Type

### Grammar

- **`tools/spec/sections/03-workers-and-namespaces.md`** — Worker Options table extended to the SDK union. New keys: `versioning` (enum `none` / `build_id` / `deployment`), `max_concurrent_nexus_task_executions` (number), `max_concurrent_nexus_task_pollers` (number), `enable_sessions` (bool), `max_concurrent_session_executions` (number). Added prose stating the set is the SDK union/superset, accepted permissively with no per-language validation, and intended for strategy/intent at design altitude (e.g. `versioning: build_id`) rather than exhaustive numeric ops tuning.

## Notes

- `versioning` is modeled as an enum of strategies (intent at altitude), not a free-form value. `build_id` uses an underscore because DSL enum values are bare idents and cannot contain hyphens (the BACKLOG's illustrative `build-id` is not tokenizable).
- The richer versioning model (Build IDs vs Worker Deployments vs ramping) and the per-namespace-vs-worker placement question remain open in `internal/changes/dsl/BACKLOG.md` → *Worker Runtime Options and Versioning / Deployment*.

## Downstream propagation

- **Parser** — schema extension landed in the same effort (see `internal/changes/parser/CHANGES_003.md`). No JSON output shape change, so no visualizer/extension contract change.
