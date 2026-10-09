# Temporal Primitives Reference

Which primitive, and where its topic lives. Syntax: [notation-reference.md](./notation-reference.md).

| Primitive | Choose it when | Topic |
|-----------|----------------|-------|
| `activity` | A single side-effecting operation | [core-principles.md](./core-principles.md) |
| `workflow` (child) | Multi-step orchestration needing its own retry/failure boundary | [child-workflows.md](../topics/child-workflows.md) |
| `nexus` | Crossing a namespace or team boundary | [nexus.md](../topics/nexus.md) |
| `promise` | You need the result later, not immediately | [promises-conditions.md](../topics/promises-conditions.md) |
| `detach` | Fire-and-forget child or Nexus call — the result can't be observed | [child-workflows.md](../topics/child-workflows.md) |
| `close continue_as_new` | History grows large (long-running or entity workflows) | [long-running.md](../topics/long-running.md) |
| `timer` | A durable wait inside workflow logic (survives restarts and replay) | [timers-scheduling.md](../topics/timers-scheduling.md) |
| timeouts | Bounding activity execution — `start_to_close_timeout`, `heartbeat_timeout` in `options:` | [timers-scheduling.md](../topics/timers-scheduling.md) |
| Schedule | Cron-like recurring workflow starts — platform configuration, not TWF notation | [timers-scheduling.md](../topics/timers-scheduling.md) |
| `query` | Read: synchronous, pure read of workflow state — never modifies it | [signals-queries-updates.md](../topics/signals-queries-updates.md) |
| `signal` | Write: async fire-and-forget into a workflow — no return value | [signals-queries-updates.md](../topics/signals-queries-updates.md) |
| `update` | Read-write: synchronous mutation with a result — prefer over signal-then-query when the caller needs confirmation | [signals-queries-updates.md](../topics/signals-queries-updates.md) |
| `state:` / `condition` / `set` / `unset` | Handlers and the main body coordinate on a boolean ("payment received"); plain local variables otherwise | [promises-conditions.md](../topics/promises-conditions.md) |
| `heartbeat` | Report progress from a long activity; detect worker death | [activities-advanced.md](../topics/activities-advanced.md) |
| `async_complete` | An external system completes the activity | [activities-advanced.md](../topics/activities-advanced.md) |
| `worker` | A reusable type set: which workflows, activities, and Nexus services run together | [task-queues.md](../topics/task-queues.md) |
| `namespace` | Deployment topology — instantiates workers with `task_queue` and options | [task-queues.md](../topics/task-queues.md), [namespaces.md](./namespaces.md) |
| `task_queue` | Routing work to specific workers | [task-queues.md](../topics/task-queues.md) |
| `nexus service` / `nexus endpoint` | A typed operation group for cross-namespace calls / routing those calls to a target task queue | [nexus.md](../topics/nexus.md) |
| search attributes, memo | Indexing a workflow for visibility queries / attaching metadata | — |
