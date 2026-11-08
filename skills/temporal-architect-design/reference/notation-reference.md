# TWF Notation Reference

A quick reference; the grammar itself is `twf spec` (`twf spec --list` for sections).

| Syntax | Meaning |
|--------|---------|
| `activity Name(args) -> result` | Call activity, bind result (default for single operations) |
| `workflow Name(args) -> result` | Call child workflow, bind result (multi-step with own failure boundary) |
| `nexus Endpoint Service.Op(input) -> result` | Nexus operation call; one input — wrap several values in a declared type |
| `detach workflow Name(args)` / `detach nexus Endpoint Service.Op(input)` | Started; outlives its caller; the result is never observed |
| `promise p <- activity\|workflow\|nexus ...` | Start async (use when you need the result later); also `promise p <- timer(duration)`, `promise p <- signal Name`; in scope from its binding to the end of its block (handlers see the body's top-level promises) |
| `await p -> result` | Await promise, bind result |
| `await timer(duration)` | Durable sleep |
| `await signal Name` / `await update Name` | Wait for a signal / update |
| `await nexus Endpoint Service.Op(args) -> result` | Wait for a Nexus call |
| `await one:` | Race: first to complete wins (timeouts, signal-or-timer). A losing inline timer is cancelled; other losing inline cases run until the run ends; a bound `promise` survives losing |
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
| `signal handle.Name(args)` / `signal Type.Name(args)` + indented `id:` | Signal a held child / any workflow by ID ([workflow-id-schemes.md](../topics/workflow-id-schemes.md)) |
| `id_scheme: "prefix-{param.key}"` | How a workflow's ID derives from its inputs (first line of its body) |
| `signal Name(params):` / `query Name(params) -> (Type):` / `update Name(params) -> (Type):` | Handlers (in a workflow, before the body) |
| `nexus service Name:` | Nexus service definition (top level) |
| `async OpName workflow WorkflowName` / `sync OpName(param) -> (Type):` | Async / sync Nexus operation (in a service body); the sync op, or the async op's workflow, takes one parameter |
| `worker name:` | Worker type set; `nexus service Name` inside registers a service |
| `@sdk(go, "cmd/w/main.go")` | Above a worker: the SDK implementing it, and its entry file once code exists ([twf-conventions.md](./twf-conventions.md#worker-implementation-sdk)) |
| `namespace name:` | Deployment: instantiates workers and `nexus endpoint Name`s with options |
| `package Name` | Package clause — first line of a file; needs a `twf.mod` above it (`twf mod init <module path>` at the design's root) ([packages.md](../topics/packages.md)) |
| `import "full/module/path"` / `import alias "path"` | Import the package with exactly that path, referenced by the path's assumed name (last element, trailing `/vN` dropped) or the alias |
| `pkg.Name` | Qualified reference into an imported package — e.g. `activity billing.ChargeCard`, `nexus Ep billing.PaymentService.Charge`. Same-package refs stay bare; endpoints are never qualified |

Indent with one tab per level; a space in indentation is a `LEX` error (`twf spec indentation`).

Namespace and endpoint names — including the endpoint in every Nexus call — are `deploy_name`s: hyphens and `{param}` template parameters allowed (`twf spec tokens-and-keywords`).

## Common `options:` Keys

A clean `twf check` requires none of these, but the design must reason about them (idempotency, history cost, failure behavior, routing).

| Key | Attaches to | Why it matters |
|-----|-------------|----------------|
| `task_queue` | activity, workflow | Routing — pins the call to a worker pool (capability, isolation, region) |
| `start_to_close_timeout` | activity, nexus | Bounds a single activity attempt (required in practice) or a started async operation |
| `schedule_to_close_timeout` | activity, nexus | Total time budget across queueing + attempts |
| `schedule_to_start_timeout` | activity, nexus | Tolerance for the wait before a worker picks it up (activity) or the handler starts the operation (nexus) |
| `heartbeat_timeout` | activity | Worker-death detection for long activities (pairs with `heartbeat()`) |
| `retry_policy` | activity, workflow | `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types` |
| `workflow_execution_timeout` / `workflow_run_timeout` / `workflow_task_timeout` | workflow | Total / per-run / per-task bounds |
| `parent_close_policy` | workflow (child start) | Child lifecycle when parent closes: `TERMINATE` (default), `REQUEST_CANCEL`, `ABANDON` |
| `workflow_id_reuse_policy` | workflow | Start onto a *closed* ID: `ALLOW_DUPLICATE`, `ALLOW_DUPLICATE_FAILED_ONLY`, `REJECT_DUPLICATE` |
| `workflow_id_conflict_policy` | workflow (client start, defaults) | Start onto a *running* ID: `FAIL`, `USE_EXISTING`, `TERMINATE_EXISTING` ([workflow-id-schemes.md](../topics/workflow-id-schemes.md#start-collisions)) |
| `priority` | activity, workflow | Relative dispatch priority |

- Each key appears at most once per options block (`DUPLICATE_OPTION_KEY`).
- **Start kind decides the workflow keys.** A child start (workflow body or handler) takes `parent_close_policy`, not `workflow_id_conflict_policy`; a client start (sync nexus body, `async` op) the reverse (`OPTION_MISPLACED`). Temporal's deprecated `TERMINATE_IF_RUNNING` is not a value: write `ALLOW_DUPLICATE` + `TERMINATE_EXISTING`.
- A Nexus call takes only the three timeouts: `task_queue` is not an option (routing comes from the endpoint), and `retry_policy` and `priority` are `OPTION_MISPLACED` (the server retries until `schedule_to_close_timeout`). A workflow **ID** is never a call option: a start's ID derives from the child type's `id_scheme:`, if it has one ([child-workflows.md](../topics/child-workflows.md#workflow-id-design)).
- There is no `cron_schedule` key (rejected as `unknown option key`); recurring starts are Temporal Schedules, platform configuration outside TWF ([timers-scheduling.md](../topics/timers-scheduling.md#schedules-cron-workflows)).
- **Handler declarations** take their own set: signal and update admit `unfinished_policy` (`abandon` | `warn_and_abandon`, the default); all three admit `description` ([signals-queries-updates.md](../topics/signals-queries-updates.md#handler-options)).
- **Worker instantiations** in a `namespace` take their own set: `task_queue` (required) and `versioning` (`none` / `build_id` / `deployment`) as the design-level strategy key, plus the worker options every Tier-1 SDK has ([task-queues.md](../topics/task-queues.md#worker-options)).

## Definition-level `default_options:`

Leads an activity/workflow body (in a workflow, before `state:`) to set defaults for every call. A call site's `options:` overrides per key; nested blocks replace whole; each start uses the defaults its kind can carry. `parent_close_policy` is call-site-only. Example: [default-options.twf](../topics/default-options.twf); rules: `twf spec statement-syntax`.
