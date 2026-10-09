# Signals, Queries, and Updates

> **Example:** [`signals-queries-updates.twf`](./signals-queries-updates.twf)

How code outside a running workflow reads it, writes to it, or does both.

| Primitive | I/O | Execution | Use when | Naming |
|-----------|-----|-----------|----------|--------|
| **Query** | Read | Sync request-response | Reading current state — UI, dashboards, monitoring, another system needing workflow data | Getter: `GetStatus`, `GetProgress` |
| **Signal** | Write | Async, fire-and-forget | Notifying the workflow of an event, injecting data, triggering a state transition, human approve/reject — no response needed | Event (past tense) or imperative: `PaymentReceived`, `Cancel`, `AddItem` |
| **Update** | Read-write | Sync request-response | Changing state and learning whether it worked — confirmation, validation before accepting, a computed result | Verb phrase: `ChangePlan`, `AddCredits` |

### Signal vs Update

| Aspect | Signal | Update |
|--------|--------|--------|
| **Response** | None | Result returned to caller |
| **Validation** | In handler; caller never learns the outcome | Caller receives validation errors |
| **Handler blocks** | Caller doesn't wait | Caller blocks until the handler returns |

## Signals

A signal handler body may use the full workflow statement set, but should only update state. When a signal is awaited (`await signal X` or an `await one` / `await all` case), execution is two-phase: the **handler body runs first**, then the **case body** runs and sees the updated state. In `ApprovalWorkflow`, the `Approved` handler sets `approver_name`; the case body reads it.

The handler also runs on every arrival whether or not the workflow is awaiting that signal — between any two deterministic steps. So activities, child workflows, and other side effects belong in the case body or main body after the await, never in the handler.

| Consideration | Guidance |
|---------------|----------|
| **Ordering** | Processed in the order received; arrival order isn't guaranteed |
| **Buffering** | Signals queue while the workflow is busy and wait until handled by `await signal` or an `await one` / `await all` case; coalesce high-volume signals |
| **Idempotency** | The same signal twice should give the same result |
| **Validation** | Validate the payload; an invalid signal can corrupt workflow state |

### Sending a signal to a child workflow

A workflow can signal a child it started and still holds a handle to. The handle is a workflow-bound promise; the dot-qualified name selects a signal the target declares.

```twf
workflow OrderSaga(order: Order) -> (SagaResult):
    promise pay <- workflow ProcessPayment(order)
    promise ship <- workflow ShipOrder(order)

    signal pay.OrderShipped(shipmentId)

    # Sending does not consume the handle; it is still awaitable
    await all:
        await pay -> payment
        await ship -> shipment
    close complete(SagaResult{payment, shipment})
```

- **Statement-only, fire-and-forget.** No `await` or `promise` form and not an `await one` case: a signal returns nothing to bind. The only thing a sender could wait on is the server accepting the send, never the receiver's handler — modeling it would invite the misreading "the target processed my signal."
- The handle must be **workflow-bound** (`promise h <- workflow X(args)`); a handle bound to a timer, signal, activity, etc. is an error.
- The target workflow must **declare** the named signal, or it is an error.

Use it to tell one saga child about an event another produced, or to push an event into a child without waiting for it to react. It is the only cross-workflow send the DSL models: workflows you did not start (ID-based sends), and cross-workflow queries and updates, are not modeled.

## Queries

| Consideration | Guidance |
|---------------|----------|
| **Read-only** | Must not modify workflow state |
| **Restricted statements** | Activity-style statements only — no timers, signals, or child workflows |
| **Determinism** | Handlers run during replay; must be deterministic |
| **Performance** | A query replays history; expensive for long histories |
| **Consistency** | Point-in-time state; may be stale by the time the caller uses it |

## Updates

An update handler may use the full workflow statement set (activities, child workflows, timers) and **must return a value**. The caller blocks until it returns — including time spent waiting on activities, timers, or state inside the handler. It **cannot `close`**: only the main body ends the workflow. `SubscriptionWorkflow` shows both an immediate mutation (`AddCredits`) and validation by activity before mutating (`ChangePlan`).

Handlers run as coroutines alongside the main body under cooperative scheduling: one piece of workflow code runs at a time. On wake-up the workflow processes pending signals and updates in order, then advances the main body. While a handler blocks, the main body can progress; all of them read and write the same workflow state.

Updates can be awaited like signals — `await update ChangeAddress`, or as an `await one` case racing a timer (`ShippingWorkflow`). When the update wins, its handler runs and returns to the caller, then the case body runs.

An update handler can **wait on a condition** the main body sets: the caller blocks, the handler yields on `await jobReady`, the main body runs `set jobReady`, and the handler resumes and returns (`JobCoordinator`; see [promises-conditions.md](./promises-conditions.md) for conditions and the `state:` block).

| Consideration | Guidance |
|---------------|----------|
| **Atomicity** | Don't leave partial state |
| **Validation** | Validate before mutating; return errors, don't throw |
| **Idempotency** | Consider idempotency keys for critical updates |
| **Timeouts** | The caller sets a timeout fit for a handler that may block on activities or state |
| **Ambient arrival** | Like signals: arrive between any two deterministic steps; buffered until handled by `await update` or an `await one` / `await all` case |

## Handler Options

Any signal, query, or update declaration may open its handler body with an `options:` block, before any statements. `SubscriptionWorkflow` uses each.

| Key | Signal | Query | Update | Values |
|-----|--------|-------|--------|--------|
| `unfinished_policy` | yes | — | yes | `abandon`, `warn_and_abandon` (default) |
| `description` | yes | yes | yes | string |

### `unfinished_policy`

What happens to a handler **still running when the workflow exits** (completes, fails, or continues-as-new). Both values drop it; they differ in whether the drop is announced.

- **`warn_and_abandon`** (default) — dropped with a logged warning. Use it whenever the handler's work *should* have finished; the warning is how you learn the workflow is racing its own handlers.
- **`abandon`** — dropped silently. Only where being cut off at exit is the designed outcome, e.g. a `Cancel` signal whose purpose is to end the workflow.

Neither value *waits* for handlers. If a handler's work matters, the design keeps the workflow alive until handlers drain; `abandon` is not a way to quiet a warning you should be fixing.

**For updates, abandonment is caller-visible**: the blocked caller gets `NotFound` instead of a result or a meaningful error. `abandon` on an update hides a real failure from the only party positioned to notice it — prefer `warn_and_abandon`, and design the main body so updates finish before it closes.

Queries don't admit `unfinished_policy`: synchronous and read-only, they leave nothing in flight.

### `description`

A short human-facing string for operators reading the workflow in the UI and CLI; no runtime effect, no effect on determinism. Write it for whoever debugs a stuck workflow at 3am: what the handler is for, not how it works.
