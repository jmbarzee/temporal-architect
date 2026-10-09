# Long-Running Workflows

> **Example:** [`long-running.twf`](./long-running.twf)

## The History Problem

Temporal replays the full event history to rebuild workflow state on every recovery. History size is the **primary constraint** on long-running workflows:

| Issue | Impact |
|-------|--------|
| Replay cost | **Entire history replayed on every recovery** — the main bottleneck |
| Hard limit | 50 MB / 51,200 events — the workflow is terminated if exceeded |
| Memory | Full history loaded into worker memory during replay |
| Latency | Longer history = slower recovery after a worker restart |

**Solution:** reset history periodically with `close continue_as_new`. A bounded loop is not exempt — see [Unbounded History](../reference/anti-patterns.md#unbounded-history).

## Continue-As-New

Atomically completes the current run and starts a new one with fresh history.

| Aspect | Behavior |
|--------|----------|
| Workflow ID | Same (logical continuity) |
| Run ID | New |
| History | Reset to zero |
| Pending signals | Carried over (configurable) |
| State | Passed as the new run's input — must be serializable |

**When:** after N events, every T hours, as history size nears the limit, or at a business boundary (end of a billing cycle). Two deterministic SDK intrinsics, callable from workflow code (not activities) and written in TWF as raw expressions:

| Function | Returns | Compare against |
|----------|---------|-----------------|
| `history_length()` | Event **count** | An event threshold (`>= 1000`) |
| `history_size()` | **Bytes** | A byte limit (`> 40_000_000`) |

**Mistakes:**
- **Losing state** — pass every piece of mutated state to `continue_as_new(...)`; anything not passed is gone.
- **Wrong place** — continue only at a natural boundary, never between steps that belong together (the later steps never run).
- **Too often** — continuing after every event is pure overhead; batch (e.g. every 1000 events).

## Entity Workflow Pattern

A long-lived workflow that *is* a business entity (user, account, subscription). Structure (`UserEntity`): `signal`/`query`/`update` handlers first — the parser rejects a handler declared after a body statement — then load the entity if the input was null, then `for: await one:` over signals and a periodic `timer`, persisting after changes and calling `continue_as_new(id, state)` past a threshold.

Clients start it with a deterministic ID (`"user-{userId}"`, input state `null`) and interact by that ID through signals, queries, and updates; it runs until a signal (`Deactivate`) closes it.

| Entity workflow | Process workflow |
|-----------------|------------------|
| Long-lived (days, months, years) | Short-lived (minutes, hours) |
| Represents a thing | Represents a process |
| Reacts to external events | Drives toward completion |
| No natural end state | Has a completion state |
| User, Account, Subscription | Order, Deployment, Migration |
