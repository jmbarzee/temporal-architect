# Workflow Versioning and Evolution

> **Example:** [`versioning.twf`](./versioning.twf)

A running workflow can outlive the code that started it. When a worker replays an execution's history against changed code — a step added, removed, reordered, or given new arguments — the commands no longer match the history and replay fails with a non-determinism error. Every change to a workflow's command sequence needs a strategy for executions already in flight.

## Choosing a strategy

| Change | Strategy | In `.twf` |
|--------|----------|-----------|
| Add, remove, change, or reorder a step; change an activity's arguments | **Patching** — branch on whether the execution predates the change | `if (flag):` on a boolean version gate |
| Changes you'd rather not patch | **Worker versioning** — route each execution to workers running compatible code | `versioning:` option on the worker instantiation |
| Input/output schema break, complete rewrite, different business logic | **New workflow type** — run old and new side by side | a new workflow name (`PolicyV1`, `PolicyV2`) |

Complexity rises down the table. Patches accumulate: when nested or numerous active patches make a workflow hard to read, consolidate them once safe, or move the change to worker versioning.

## Patching

`.twf` has no `patched()` construct. A version gate is a boolean — a workflow parameter or a config field — and the branch shows both paths, as every workflow in [`versioning.twf`](./versioning.twf) does. In code it becomes the SDK's patch API (Go: `workflow.GetVersion()` / `workflow.Patched()`; Python: `patched()`): a new execution records a patch marker in history and takes the new path; replay of an execution without the marker takes the old path.

Removal inverts the gate: the old step runs only for executions that predate the change (`BatchJobRemoveLegacyStep`). Removing a step without a gate is the common unguarded change.

**Patch lifecycle.** A patch is temporary; one left in place forever is dead code.

1. **Add** the patch with both paths. Name it for the change and date (`2024-01-add-fraud-check`) and keep a record of which patches are active.
2. **Deploy** with both paths live; write replay tests against histories recorded on the old code (see [testing.md](./testing.md#replay-testing)) and watch for non-determinism errors.
3. **Deprecate** once no running execution needs the old path — find stragglers with a visibility query such as `StartTime < '<patch date>' AND ExecutionStatus = 'Running'`. The SDK's deprecate-patch step fails loudly if an old execution is still running.
4. **Remove** the patch code entirely.

## Worker versioning

### Declaring the strategy in `.twf`

A worker instantiation declares the versioning strategy its pool follows. This is the design-altitude decision; Build IDs, deployment names, registration, and ramping are deploy-time inputs and never `.twf` content.

```twf
namespace orders:
    worker orderTypes
        options:
            task_queue: "orderProcessing"
            versioning: deployment
```

| Value | Meaning |
|-------|---------|
| `none` | Unversioned workers (default) |
| `deployment` | Worker Deployments — the current model |
| `build_id` | Legacy Build ID version sets (deprecated, not on Temporal Cloud) |

Several worker versions serve one task queue at once. Each workflow type is **Pinned** (finishes on the version it started on) or **Auto-Upgrade** (moves to the current version, so it still needs patching); TWF cannot express that choice yet ([#167](https://github.com/jmbarzee/temporal-architect/issues/167)), so state it in the handoff notes.

## New workflow type

Declare the new version as its own workflow with its own types; the caller (application code, outside `.twf`) chooses which type to start.

```twf
workflow PolicyV1(policy: PolicyV1Input) -> (PolicyV1Result):
    ...

workflow PolicyV2(policy: PolicyV2Input) -> (PolicyV2Result):
    ...
```
