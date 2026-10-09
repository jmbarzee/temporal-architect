# Determinism & Idempotency

## Determinism: Workflows Must Replay Identically

Temporal replays workflow code to reconstruct state; a different result on replay is a non-determinism error ([Temporal: Deterministic Constraints](https://docs.temporal.io/workflows#deterministic-constraints)). **Workflows are pure orchestration; activities are side effects.**

| Safe in Workflows | Must Be in Activities |
|-------------------|----------------------|
| Logic on activity results | Current time, dates |
| Deterministic loops/conditionals | Random numbers, UUIDs |
| Child workflows | HTTP/API calls |
| Temporal timers | Database operations |
| Local variables | File I/O |
| Signal waits | External service calls |
| Deterministic iteration (arrays, slices) | Map/dictionary iteration (order varies) |
| Temporal SDK concurrency (promises, await all) | Language-level threads, goroutines, async |
| Workflow-local state | Mutable global/shared state |

### Activities Are for I/O — Not In-Memory Work

The table is often over-applied into activity sprawl. The litmus test: *does it touch an external system or produce a side effect?* If not, it's workflow code — each spurious activity is a task-queue round-trip plus a history event for no resilience benefit. Never wrap in an activity:

- **Reads of data the workflow already holds** — field access or lookups into a struct/ref passed in or returned earlier (`ReadCritiqueReady`, `LookupBundleRef`).
- **In-memory derivation** — filtering, mapping, computing from held inputs (`ListSubsetPaperIds`).
- **Accumulation** — appending to a list or building state (`AppendObservations`, `AppendTrajectory`); write it in the workflow body, as a raw statement if need be.

> **Optimization, not default:** batch several small calls into one activity only when they always succeed/fail together and per-call retry is meaningless; consider local activities for short deterministic helpers. Both deviate from "one activity per network call" ([workflow-boundaries.md](./workflow-boundaries.md)).

## Idempotency: Activities May Run Multiple Times

Retries happen (network failures, crashes, timeouts), so an activity must reach the same result regardless of execution count.

| Pattern | When | Example |
|---------|------|---------|
| **Create-or-get** | Entity has a natural unique key | Check existence before creating |
| **Idempotency key** | External system supports one | Workflow ID + activity name as the key |
| **Upsert** | Database supports atomic upsert | Prefer over insert-then-update |
| **Deduplication** | Last resort, no built-in mechanism | Query before mutating |

E.g. CreateUser returns the existing user; SendEmail passes a provider idempotency key; DeployResource verifies state and succeeds if already deployed.

### State the Strategy in the Design

For every activity that isn't idempotent by nature, the design names its strategy and key derivation, so idempotency is a decision rather than an assumption:

> `ChargePayment` — idempotency key = `"{workflow_id}-ChargePayment"`; provider dedupes on it.

`twf check` can't validate this — Temporal has no call-site `idempotency_key` option — so the [Design Review](../SKILL.md#design-review) checks for the note.
