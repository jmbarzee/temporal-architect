# Author-Go Skill Backlog

Enhancement ideas for the author-go skill. Not errors — all current content is functional. Items here represent coverage gaps or areas where newer DSL features could be better leveraged. Not committed to any cycle — just a place to drop thoughts.

---

## SKILL.md

- Reference Index missing nexus call row (`nexus Endpoint Service.Op(args) -> result`)
- Layer 4 ("Worker wiring") could reference TWF worker/namespace blocks as inputs for generating worker initialization code
- Missing rows for nexus service definitions, worker blocks, and namespace blocks mapped to Go equivalents

## reference/await-one.md

- Missing nexus case example in `await one:` blocks
- Missing update case example

## reference/promise.md

- Missing nexus promise variant (`promise p <- nexus Endpoint Service.Op(args)`)
- Missing update promise variant

## reference/options.md

- Missing nexus call options example (`schedule_to_close_timeout`, `retry_policy`, `priority`)
- Could reference worker/namespace options

## reference/await-all.md

- Could show nexus call inside `await all:` block

## reference/activity-call.md

- Could show inline options block example alongside the basic call

## Missing reference files

- No `worker.md` or `namespace.md` reference file for Go code generation of these constructs
- No `nexus-service-def.md` for generating nexus service handler code
