# Author-Go Skill Changes

**Source review(s):** `review-alignment-author-skills` (propagated from `internal/changes/dsl/CHANGES_005.md` — Worker Options extended to the SDK union + `versioning` strategy key)
**REVISIONS file(s):** `internal/changes/author-go-skill/REVISIONS_001.md`

## Summary

Retracted the now-backwards "Deferred: worker runtime options" guidance in `reference/worker.md` and replaced it with a DSL→`worker.Options` mapping, since these options are now first-class DSL keys. Added the `versioning` strategy treatment (legacy `BuildID` vs current `DeploymentOptions`) and the session/versioning mutual-exclusion pitfall.

## Changes by Type

### Internal

- **`skills/temporal-architect-author-go/reference/worker.md`** — replaced the "## Deferred: worker runtime options" section (which incorrectly told authors to keep worker tuning out of the `.twf`) with "## Worker options → `worker.Options`":
  - A mapping table from each namespace `options:` key to its `worker.Options` field, covering the five new CHANGES_005 keys (`max_concurrent_nexus_task_executions` → `MaxConcurrentNexusTaskExecutionSize`, `max_concurrent_nexus_task_pollers` → `MaxConcurrentNexusTaskPollers`, `enable_sessions` → `EnableSessionWorker`, `max_concurrent_session_executions` → `MaxConcurrentSessionExecutionSize`, `versioning` → not 1:1) plus the pre-existing union keys (concurrency caps, rate limiters, sticky timeout, identity, stop timeout, local-activity-only). `max_cached_workflows` is documented as the process-global `worker.SetStickyWorkflowCacheSize`, not a `worker.Options` field; `heartbeat_throttle_interval` → `MaxHeartbeatThrottleInterval`.
  - A populated `worker.Options{…}` example mapped from a small namespace block.
  - A permissive-union caveat: drop keys the Go SDK has no field for rather than inventing an API; the richer versioning model stays deferred in `dsl/BACKLOG.md`.
  - A `versioning` subsection: `none` / `build_id` (legacy `BuildID` + `UseBuildIDForVersioning`, flagged Deprecated) / `deployment` (`DeploymentOptions`), with Build ID / deployment name / version sourced from env at deploy time, not the `.twf`.
  - A mutual-exclusion pitfall callout: worker versioning cannot be combined with `EnableSessionWorker`; surface a `.twf` carrying both as a conflict.

## Validation

SDK field names verified against the Temporal Go SDK (`worker.WorkerOptions` / `worker.DeploymentOptions`) via the Temporal docs MCP during review. Documentation-only change; markdown lint clean.
