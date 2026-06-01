# Determinism & Idempotency

## Determinism: Workflows Must Replay Identically

Temporal replays workflow code to reconstruct state. Different replay results = non-determinism errors. See [Temporal: Deterministic Constraints](https://docs.temporal.io/workflows#deterministic-constraints) for the authoritative reference.

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

**Workflows = pure orchestration. Activities = side effects.**

### Activities Are for I/O — Not In-Memory Work

The table above is often *over*-applied into activity sprawl: wrapping things in an activity that were never side effects. **Activities are for I/O and side effects. Do not wrap in an activity:**

- **Reads of data the workflow already holds** — field access, lookups into a struct/ref passed in or returned by an earlier activity (`ReadCritiqueReady`, `LookupBundleRef`). The workflow already has the data; reading it is workflow code.
- **In-memory derivation** — filtering, mapping, computing a value from inputs the workflow holds (`ListSubsetPaperIds`).
- **Accumulation** — appending to a list or building up state (`AppendObservations`, `AppendTrajectory`). Building a collection is deterministic in-memory work and belongs in the workflow body (expressible directly, including as a raw statement) — there is no need for an `Append*` activity.

Each spurious activity is a task-queue round-trip plus a history event for **no resilience benefit**. The litmus test: *does it touch an external system or produce a side effect?* If not, it's workflow code.

> **Optimization (away from the default):** batch several small calls into one activity only when they always succeed/fail together and per-call retry isn't meaningful; consider local activities for short deterministic helpers. These are deviations from "one activity per network call" (see [workflow-boundaries.md](./workflow-boundaries.md)), not the starting point.

## Idempotency: Activities May Run Multiple Times

Retries happen (network failures, crashes, timeouts). Activities must be **idempotent**: same inputs → same result regardless of execution count.

| Pattern | Example |
|---------|---------|
| **Create-or-get** — when entity has a natural unique key | Check existence before creating |
| **Idempotency keys** — when external system supports them | Workflow ID + activity name as operation key |
| **Upsert** — when database supports atomic upsert | Prefer over insert-then-update |
| **Deduplication** — last resort when no built-in mechanism | Query before mutating |

**Think through retries:** CreateUser → return existing if exists. SendEmail → provider idempotency key. DeployResource → verify state, return success if deployed.

### State the Strategy in the Design

Knowing the patterns isn't enough — the *design* must **state** which one each side-effecting activity uses, so idempotency is a load-bearing decision rather than an assumed prose comment. For every activity that isn't idempotent by nature, name its strategy and key derivation, e.g.:

> `ChargePayment` — idempotency key = `"{workflow_id}-ChargePayment"`; provider dedupes on it.

This is a **skill/design concern, not a `twf check` rule** — Temporal has no call-site `idempotency_key` option, so the parser cannot validate it. The [Design Review](../SKILL.md#design-review) checks that each non-idempotent activity carries this note.
