# TWF Notation Reference

| Syntax | Meaning |
|--------|---------|
| `activity Name(args) -> result` | Call activity, bind result (default for single operations) |
| `workflow Name(args) -> result` | Call child workflow, bind result (multi-step with own failure boundary) |
| `nexus Endpoint Service.Op(args) -> result` | Nexus service operation call |
| `detach nexus Endpoint Service.Op(args)` | Fire-and-forget nexus call (no result observation possible) |
| `promise p <- nexus Endpoint Service.Op(args)` | Start async nexus call |
| `promise p <- activity Name(args)` | Start async activity (use when you need the result later, not immediately) |
| `promise p <- workflow Name(args)` | Start async child workflow (parallel child execution) |
| `promise p <- timer(duration)` | Start async timer |
| `promise p <- signal Name` | Promise for signal |
| `await p -> result` | Await promise, bind result |
| `state:` | Workflow state block (conditions and variable initializations) |
| `condition name` | Named boolean awaitable (in `state:` block) |
| `set name` | Set condition to true (coordinate between handlers and main body) |
| `unset name` | Set condition to false |
| `await name` | Await condition |
| `detach workflow Name(args)` | Fire-and-forget child workflow (no result observation possible) |
| `await timer(duration)` | Durable sleep |
| `await signal Name` | Wait for signal |
| `await update Name` | Wait for update |
| `await nexus Endpoint Service.Op(args) -> result` | Wait for nexus call |
| `await one:` | Race: first to complete wins (timeouts, signal-or-timer patterns). Non-winning operations are **not** cancelled — they keep running until the workflow run ends |
| `await all:` | Join: wait for all (parallel execution) |
| `heartbeat()` | Report progress from long-running activity (detect worker death) |
| `options: key: value` | Options block for activity/workflow/nexus calls and signal/query/update handler declarations |
| `default_options: key: value` | Definition-level default options for an `activity`/`workflow` definition, applied to calls of that definition (see [Definition-level `default_options:`](#definition-level-default_options)) |
| `-> (Type)` | Return type (always parenthesized) |
| `-> result` | Bind preceding result |
| `close complete\|fail\|continue_as_new(Value)` | End workflow with result, failure, or continuation |
| `if (expr):` / `else:` | Conditional |
| `for (x in collection):` | Bounded loop |
| `for:` | Infinite loop (needs `close continue_as_new` or `close complete`) |
| `switch (expr):` / `case val:` | Multi-branch conditional |
| `close continue_as_new(args)` | Reset history and continue |
| `signal Name(params):` | Signal handler (in workflow, before body) |
| `query Name(params) -> (Type):` | Query handler (in workflow, before body) |
| `update Name(params) -> (Type):` | Update handler (in workflow, before body) |
| `nexus service Name:` | Nexus service definition (top-level) |
| `async OpName workflow WorkflowName` | Async nexus operation (in service body) |
| `sync OpName(params) -> (Type):` | Sync nexus operation (in service body) |
| `worker name:` | Worker type set definition |
| `nexus service Name` (in worker) | Register nexus service on worker |
| `namespace name:` | Namespace definition (deployment with options) |
| `nexus endpoint Name` (in namespace) | Nexus endpoint instantiation with task_queue |
| `package Name` | Package clause — first line of a file; groups a directory's symbols (see [packages.md](../topics/packages.md)) |
| `import "full/module/path"` | Import a package, referenced by its leaf name |
| `import alias "full/module/path"` | Import a package under an explicit alias (disambiguates leaf clashes) |
| `pkg.Name` (qualified reference) | Reference a symbol in an imported package by leaf name — e.g. `activity billing.ChargeCard`, `nexus Ep billing.PaymentService.Charge`. Same-package refs stay bare; endpoints are never qualified |

## Common `options:` Keys

`options:` blocks attach operational config to a call. A clean `twf check` does not require any of these — but the design must reason about them (idempotency, history cost, failure behavior, routing). This is a lookup table; the *reasoning* lives in the worked example in [SKILL.md](../SKILL.md#design-flow) and the topic docs.

| Key | Attaches to | Why it matters |
|-----|-------------|----------------|
| `task_queue` | activity, workflow | Routing — pins the call to a specific worker pool (capability, isolation, region) |
| `start_to_close_timeout` | activity | Failure behavior — bounds a single attempt; required in practice for any real activity |
| `schedule_to_close_timeout` | activity, nexus | Total time budget across queueing + attempts |
| `schedule_to_start_timeout` | activity | Tolerance for queue wait before a worker picks it up |
| `heartbeat_timeout` | activity | Worker-death detection for long activities (pairs with `heartbeat()`) |
| `retry_policy` | activity, workflow, nexus | Failure behavior — `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types` |
| `workflow_execution_timeout` / `workflow_run_timeout` / `workflow_task_timeout` | workflow | Bounds for total / per-run / per-task duration |
| `parent_close_policy` | workflow | Child lifecycle when parent closes: `TERMINATE` (default), `REQUEST_CANCEL`, `ABANDON` |
| `workflow_id_reuse_policy` | workflow | Idempotency on retry: `ALLOW_DUPLICATE`, `ALLOW_DUPLICATE_FAILED_ONLY`, `REJECT_DUPLICATE`, `TERMINATE_IF_RUNNING` |
| `priority` | activity, workflow, nexus | Relative dispatch priority |

> The child-workflow **ID** itself is an SDK-level concern, not a TWF call option — see [child-workflows.md](../topics/child-workflows.md#workflow-id-design). `task_queue` is intentionally **not** a nexus-call option; nexus routing comes from the endpoint declaration.

> **Handler-declaration `options:` are a separate set** — they lead the body of a `signal` / `query` / `update` declaration. Signal and update admit `unfinished_policy` (`abandon` | `warn_and_abandon`, default `warn_and_abandon`); all three admit `description` (string). See [signals-queries-updates.md](../topics/signals-queries-updates.md#handler-options).

> **Worker-instantiation `options:` are a separate set** from the call options above — they attach to a `worker` (or `nexus endpoint`) inside a `namespace`, not to a call. `task_queue` is required; `versioning` (`none` / `build_id` / `deployment`) is the design-altitude strategy key. The set is the SDK union, accepted permissively — see [task-queues.md](../topics/task-queues.md#worker-options) and `twf spec`.

> **Recurring starts are not a call option.** There is no `cron_schedule` option key — a workflow call options block that uses it is rejected as an `unknown option key`. To start a workflow on a recurring basis, use **Temporal Schedules** (platform configuration managed through the CLI/SDK, not TWF notation). See [timers-scheduling.md](../topics/timers-scheduling.md#schedules-cron-workflows).

## Definition-level `default_options:`

An `activity` or `workflow` definition may declare a `default_options:` block that supplies default option values for every call of that definition. This keeps operational config (timeouts, retry policy, task queue) with the definition instead of repeating it at each call site. See [default-options.twf](../topics/default-options.twf) for a worked example.

**Placement** — the block leads the definition body:

- **Activity**: the head of the body, before any statements.
- **Workflow**: the first body element, before the optional `state:` block.

```twf
activity ChargeCard(card, amount) -> receipt
    default_options:
        start_to_close_timeout: 30s
        retry_policy:
            maximum_attempts: 5

workflow FulfillOrder(order) -> (OrderResult):
    default_options:
        workflow_execution_timeout: 1h
    state:
        condition paid
    ...
```

**Key partition** — which keys a `default_options:` block accepts:

- **Activity** `default_options:` accepts **every** activity call-option key from the table above.
- **Workflow** `default_options:` accepts every workflow call-option key **except** `parent_close_policy`. `parent_close_policy` is call-site-only: it is relational — it describes one parent↔child bond, not the workflow type — and is rejected at definition level with a `call-site-only option key not allowed in default_options: parent_close_policy` error. (`cron_schedule` is no longer an option key at all, so it is likewise unavailable here.)

**Precedence** — a call-site `options:` block overrides the definition's `default_options:` **per key**:

- A key present at the call site wins over the same key in `default_options:`; keys only in `default_options:` still apply.
- Nested blocks (`retry_policy`, `priority`) **atomic-replace** — a call-site `retry_policy:` replaces the whole default `retry_policy:`, there is no deep merge of individual fields.
- Precedence is **declarative**: the parser validates the definition-level and call-site blocks independently and does **not** compute a merged/effective options set. The override semantics describe how a code generator or the SDK layers the two blocks, not a parser transformation.

Full grammar: [`tools/spec/sections/`](../../../tools/spec/sections/) (or run `twf spec`).
