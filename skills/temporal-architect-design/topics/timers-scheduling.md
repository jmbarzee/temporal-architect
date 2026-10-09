# Timers and Scheduling

> **Example:** [`timers-scheduling.twf`](./timers-scheduling.twf)

## Timers

`await timer(d)` is a durable sleep: the workflow's state survives worker restarts, deployments, and failures, and it resumes when the timer fires.

| Aspect | Guidance |
|--------|----------|
| **Precision** | Not millisecond-precise; expect seconds of variance |
| **History** | Each timer adds history events; avoid very frequent short timers, and give periodic loops `continue_as_new` (`HealthMonitor`, `LongPoller`) |

## Deadlines

- **Whole workflow:** `workflow_execution_timeout` — a call option on a child, a start option for a top-level workflow.
- **One activity:** its `options:` timeouts — see [activities-advanced.md](./activities-advanced.md#timeouts).
- **Any step, with a fallback path:** race it against a timer.

```twf
workflow ProcessWithDeadline(data: Data) -> (Result):
    await one:
        activity LongOperation(data) -> result:
            close complete(Result{success: true, data: result})
        timer(1h):
            activity Cleanup(data)
            close fail(Result{success: false, error: "deadline exceeded"})
```

> **`await one` does not cancel the loser.** If the timer wins, `LongOperation` keeps running until the workflow run ends — `await one` is "first to complete wins," not "winner cancels the rest." If the loser must actually stop (release a lock, stop billing), add an explicit cancellation/cleanup activity.

The same race bounds a signal wait: `await one:` over the expected signals plus `timer(7d):` for the expiry path. For recurring work inside a workflow, loop over an activity and `await timer(...)`; for polling with backoff, see [patterns.md](./patterns.md#polling).

## Schedules (Cron Workflows)

Temporal Schedules start workflows on a recurring basis (cron expressions, intervals, calendars). They are **platform configuration**, not workflow design — they define *when* a workflow starts, not *how* it runs — and are managed through the Temporal CLI or SDK (specs, overlap policies, catchup windows, timezones), not TWF. See [Temporal Schedules documentation](https://docs.temporal.io/workflows#schedule).

**Design implication:** design a scheduled workflow like any other — idempotent, with `continue_as_new` if long-running. The schedule is an external trigger, not part of the workflow's logic.
