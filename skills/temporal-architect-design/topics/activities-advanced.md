# Advanced Activity Patterns

> **Example:** [`activities-advanced.twf`](./activities-advanced.twf)

Activity bodies (heartbeat calls, task tokens, error classes) are SDK-level; the design's job is to say which activities need them and to set the matching `options:`.

## Heartbeats

Any long-running activity should call `heartbeat()` periodically and set `heartbeat_timeout`.

| Without heartbeat | With heartbeat |
|-------------------|----------------|
| Worker crash detected only at activity timeout | Worker crash detected within `heartbeat_timeout` |
| No visibility into progress | Progress visible during execution |
| Full retry from the start on any failure | Retry resumes from the last heartbeat's details |

- **Resume:** heartbeat a progress marker (`heartbeat(index: i + 1)`); on retry, read `get_heartbeat_details()` and start from there (`ResumableProcess`). A 2-hour activity without this restarts from zero after a crash at 1h59m.
- **Cancellation:** an activity learns the workflow cancelled it through its heartbeat; check there, clean up, and raise a cancelled error.

## Async Completion

The activity hands its task token to an external system and returns without completing; the external system later calls Temporal's client API to complete it, fail it, or report it cancelled. Use for human tasks in an external tool, third-party callbacks, and completion triggered by an external event instead of polling.

In the workflow it is an ordinary activity call — give it a `start_to_close_timeout` as long as the external party may take (`RequestHumanApproval` in `PublishApprovalWorkflow`: `7d`).

## Local Activities

Run in the workflow worker's process, skipping the task-queue round trip. TWF has no local-activity marker — it is an SDK-level choice; note it on the call in a comment.

| Use local activity | Use regular activity |
|--------------------|----------------------|
| Very short (< 10s), low latency required | Longer operations; normal latency acceptable |
| Simple; tight retry | Complex; standard retry policies |
| Workflow worker has the required resources | May need a different worker (task-queue routing) |
| No network calls | External calls |

Limits: no task-queue routing, a short retry window, no heartbeat, and not persisted across a worker restart (restart = retry).

## Timeouts

Temporal requires `start_to_close` or `schedule_to_close`; `schedule_to_close >= schedule_to_start + start_to_close`. Key meanings: [notation-reference.md](../reference/notation-reference.md#common-options-keys).

| Operation type | schedule_to_start | start_to_close | heartbeat |
|----------------|-------------------|----------------|-----------|
| Quick lookup | None | 10-30s | None |
| API call | None | 30s-2m | None |
| Batch processing | None | Minutes-hours | 30-60s |
| Human task | Minutes-hours | Days (or async completion) | None |
| External callback | None | Hours-days | None |

## Retries

Set `retry_policy` in the call's `options:` (`LargeFileIngestion` shows one). Inside the activity, classify errors: transient (rate limit) — rethrow and let Temporal retry; invalid input — raise a non-retryable application error; an expected business outcome (not found) — return it as a value.
