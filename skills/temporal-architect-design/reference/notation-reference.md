# TWF Notation Reference

A quick reference; the grammar itself is `twf spec` (`twf spec --list` for sections).

| Syntax | Meaning |
|--------|---------|
| `activity Name(args) -> result` | Call activity, bind result (default for single operations) |
| `workflow Name(args) -> result` | Call child workflow, bind result (multi-step with own failure boundary) |
| `nexus Endpoint Service.Op(args) -> result` | Nexus operation call |
| `detach workflow Name(args)` / `detach nexus Endpoint Service.Op(args)` | Fire-and-forget; the result can't be observed |
| `promise p <- activity\|workflow\|nexus ...` | Start async (use when you need the result later); also `promise p <- timer(duration)`, `promise p <- signal Name` |
| `await p -> result` | Await promise, bind result |
| `await timer(duration)` | Durable sleep |
| `await signal Name` / `await update Name` | Wait for a signal / update |
| `await nexus Endpoint Service.Op(args) -> result` | Wait for a Nexus call |
| `await one:` | Race: first to complete wins (timeouts, signal-or-timer). Losers are **not** cancelled — they run until the workflow run ends |
| `await all:` | Join: wait for all (parallel execution) |
| `state:` | Workflow state block (conditions and variable initializations) |
| `condition name` | Named boolean awaitable (in `state:`) |
| `set name` / `unset name` / `await name` | Set true / set false / await a condition (coordinates handlers and main body) |
| `heartbeat()` | Report progress from a long-running activity (detects worker death) |
| `options:` | Options block on activity/workflow/nexus calls and signal/query/update declarations |
| `default_options:` | Definition-level defaults for calls of an `activity`/`workflow` ([below](#definition-level-default_options)) |
| `-> (Type)` | Return type (always parenthesized) |
| `-> result` | Bind preceding result |
| `close complete\|fail\|continue_as_new(Value)` | End the run with a result, a failure, or a continuation (resets history) |
| `if (expr):` / `else:` | Conditional |
| `for (x in collection):` | Bounded loop |
| `for:` | Infinite loop (needs `close continue_as_new` or `close complete`) |
| `switch (expr):` / `case val:` | Multi-branch conditional |
| `signal Name(params):` / `query Name(params) -> (Type):` / `update Name(params) -> (Type):` | Handlers (in a workflow, before the body) |
| `nexus service Name:` | Nexus service definition (top level) |
| `async OpName workflow WorkflowName` / `sync OpName(params) -> (Type):` | Async / sync Nexus operation (in a service body) |
| `worker name:` | Worker type set; `nexus service Name` inside registers a service |
| `namespace name:` | Deployment: instantiates workers and `nexus endpoint Name`s with options |
| `package Name` | Package clause — first line of a file ([packages.md](../topics/packages.md)) |
| `import "full/module/path"` / `import alias "path"` | Import a package, referenced by its leaf name (trailing `/vN` stripped) or the alias |
| `pkg.Name` | Qualified reference into an imported package — e.g. `activity billing.ChargeCard`, `nexus Ep billing.PaymentService.Charge`. Same-package refs stay bare; endpoints are never qualified |

Namespace and endpoint names — including the endpoint in every Nexus call — are `deploy_name`s: hyphens and `{param}` holes allowed (`twf spec tokens-and-keywords`).

## Common `options:` Keys

A clean `twf check` requires none of these, but the design must reason about them (idempotency, history cost, failure behavior, routing).

| Key | Attaches to | Why it matters |
|-----|-------------|----------------|
| `task_queue` | activity, workflow | Routing — pins the call to a worker pool (capability, isolation, region) |
| `start_to_close_timeout` | activity | Bounds a single attempt; required in practice for any real activity |
| `schedule_to_close_timeout` | activity, nexus | Total time budget across queueing + attempts |
| `schedule_to_start_timeout` | activity | Tolerance for queue wait before a worker picks it up |
| `heartbeat_timeout` | activity | Worker-death detection for long activities (pairs with `heartbeat()`) |
| `retry_policy` | activity, workflow, nexus | `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types` |
| `workflow_execution_timeout` / `workflow_run_timeout` / `workflow_task_timeout` | workflow | Total / per-run / per-task bounds |
| `parent_close_policy` | workflow | Child lifecycle when parent closes: `TERMINATE` (default), `REQUEST_CANCEL`, `ABANDON` |
| `workflow_id_reuse_policy` | workflow | Idempotency on retry: `ALLOW_DUPLICATE`, `ALLOW_DUPLICATE_FAILED_ONLY`, `REJECT_DUPLICATE`, `TERMINATE_IF_RUNNING` |
| `priority` | activity, workflow, nexus | Relative dispatch priority |

- `task_queue` is not a Nexus call option — Nexus routing comes from the endpoint. The child-workflow **ID** is an SDK concern, not an option ([child-workflows.md](../topics/child-workflows.md#workflow-id-design)).
- There is no `cron_schedule` key (rejected as `unknown option key`); recurring starts are Temporal Schedules, platform configuration outside TWF ([timers-scheduling.md](../topics/timers-scheduling.md#schedules-cron-workflows)).
- **Handler declarations** take their own set: signal and update admit `unfinished_policy` (`abandon` | `warn_and_abandon`, the default); all three admit `description` ([signals-queries-updates.md](../topics/signals-queries-updates.md#handler-options)).
- **Worker instantiations** in a `namespace` take their own set: `task_queue` (required) and `versioning` (`none` / `build_id` / `deployment`) as the design-level strategy key, plus the SDK union, accepted permissively ([task-queues.md](../topics/task-queues.md#worker-options)).

## Definition-level `default_options:`

Leads an activity/workflow body (in a workflow, before `state:`) to set defaults for every call. A call site's `options:` overrides per key; nested blocks replace whole. `parent_close_policy` is call-site-only. Example: [default-options.twf](../topics/default-options.twf); rules: `twf spec statement-syntax`.
