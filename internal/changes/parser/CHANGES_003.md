# Parser Changes

**Source review(s):** skill-retro planning session (`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 3 — prioritized trio)
**REVISIONS file(s):** `internal/changes/parser/REVISIONS_002.md` (Group 1 — Worker-Options Permissive Acceptance); paired with `internal/changes/dsl/REVISIONS_001.md` Group 1.

## Summary

Permissively accept the SDK-union worker options to match the DSL change, with no per-language validation. Coordinated with `internal/changes/dsl/CHANGES_005.md`.

## Changes by Type

### Internal

- **`tools/lsp/parser/parser/options.go`** — extended `workerOptionSchema` to the SDK union. Added keys: `versioning` (enum `none` / `build_id` / `deployment`, via new `versioningStrategies` slice), `max_concurrent_nexus_task_executions` (number), `max_concurrent_nexus_task_pollers` (number), `enable_sessions` (bool), `max_concurrent_session_executions` (number). Added doc comments noting the union/permissive intent (an option missing from one SDK does not gate inclusion).

## Note on where unknown-key acceptance actually lives

REVISIONS_002 anticipated changes in `validator/` and `resolver/`, but neither inspects option keys — option key/type/enum validation is parse-time only (`parseOptionEntry` consulting `schemaForContext`), as recorded in `internal/changes/parser/CHANGES_002.md`. "Stop emitting unknown-key errors for the new keys" is therefore satisfied entirely by extending `workerOptionSchema`; no `validator/` or `resolver/` code change was needed. The LSP server does not hardcode a worker-option key list, so nothing there fell out of sync.

## Tests

`go build ./...` and `go test -count=1 ./...` from `tools/lsp/` pass (parser, resolver, validator, server, cmd/twf). No new test was added — the union keys ride the existing `parseOptionEntry` / `schemaForContext` path already covered by handler/call option tests.

## Downstream propagation

- None. No JSON output shape change (more keys are accepted, but the `OptionsBlock` shape is unchanged), so the visualizer and VS Code extension contracts are unaffected.
