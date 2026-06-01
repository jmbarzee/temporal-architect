# Design Skill Backlog

Enhancement ideas for the design skill. Not errors — all current content is functional. Items here represent coverage gaps or areas where newer DSL features could be better leveraged. Not committed to any cycle — just a place to drop thoughts.

> **Reconciled (this cycle):** Many earlier entries were stale — the listed gap had already been closed in the current skill files. Removed as stale: SKILL.md completion-checklist topology check (Completion #3 already covers it), Reference Index nexus/task-queues links (already present), "Rules table" nexus rules (no such table), common-errors nexus/worker/namespace catalog (fully documented), design-checklist deployment-topology checks (Deployment Topology section exists), anti-patterns "only 3 covered" (11+ now), workflow-boundaries "Use Nexus When" (section exists), primitives-reference worker/namespace (Infrastructure section has them), patterns `elif` (state machine uses `switch`/`case`), task-queues "nexus service" line (already says "workflow, activity, and nexus service"), child-workflows `workflow_id` rethink (now framed as SDK-level).
>
> Items consumed by `REVISIONS_001`–`005` (idempotency-strategy expectation, activity-sprawl / nexus-same-namespace / misplaced-deployment-config anti-patterns, SDK-intrinsic + entity-ordering cleanup, `history_size` → `history_length` fix) have been implemented and removed.

---

## Deferred: worker/namespace deployment context in topic examples

A recurring low-priority theme: several topic files teach a construct without showing how it gets deployed (worker registration / namespace instantiation). Lazy to add; not load-bearing for the design itself.

- `topics/activities-advanced.md` — no worker/namespace context for how activities relate to deployment.
- `topics/child-workflows.md` — no worker/namespace deployment shown for parent/child relationships.
- `topics/long-running.md` — could show worker/namespace blocks for how entity workflows get deployed.

## Deferred: nexus coverage in patterns/testing

- `topics/patterns.md` — no nexus patterns shown; could add a cross-namespace pattern using current nexus syntax.
- `topics/testing.md` — could add a nexus testing section showing how to test cross-namespace calls.

## Deferred: SKILL.md basic-structure example

- `SKILL.md` — the worked example is intentionally minimal (single workflow). A larger end-to-end example showing worker/namespace topology could live in `notation-examples.md` rather than the SKILL.md quick example, to avoid bloating the entry point.
