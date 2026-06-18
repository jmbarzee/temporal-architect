# Design Skill Backlog

Enhancement ideas for the design skill. Not errors — all current content is functional. Items here represent coverage gaps or areas where newer DSL features could be better leveraged. Not committed to any cycle — just a place to drop thoughts.

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
