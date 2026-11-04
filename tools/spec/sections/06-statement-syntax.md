# Statement Syntax

## Activity Call

```
activity_call ::= 'activity' IDENT args ['->' result] [NEWLINE options_line]

args ::= '(' [arg_list] ')'
arg_list ::= expr (',' expr)*
result ::= IDENT | '(' IDENT (',' IDENT)* ')'

options_line ::= INDENT 'options' ':' NEWLINE INDENT option_entry+ DEDENT NEWLINE DEDENT
```

**Note:** When using options blocks, the `options:` block must be indented on the line following the activity call.

## Options Block

```
options_block ::= 'options' ':' NEWLINE INDENT option_entry+ DEDENT
option_entry  ::= IDENT ':' value NEWLINE
                | IDENT ':' NEWLINE INDENT option_entry+ DEDENT

value ::= STRING | DURATION | NUMBER | IDENT | list_value
list_value ::= '[' [ STRING (',' STRING)* ] ']'

DURATION ::= NUMBER ('ms' | 's' | 'm' | 'h' | 'd')
NUMBER ::= [0-9]+ ['.' [0-9]+]
```

Options blocks use indentation-based nesting (same as the rest of TWF). Each key-value pair goes on its own line. Nested blocks (like `retry_policy`) use deeper indentation. A key appears at most once per block; a repeat is `DUPLICATE_OPTION_KEY`.

A `list_value` is a bracketed inline list. Its elements are `STRING`s only. An empty list `[]` is
allowed (an explicit "none"). No trailing comma is permitted (matching `arg_list`). The whole list
is a single logical line — no `NEWLINE` may appear inside the brackets. Like the scalar value forms,
a list is accepted anywhere a `value` is expected; which *keys* accept a list is a schema concern
(see the per-context key tables below), not a grammar concern.

**Allowed keys per context:**

Activity call options: `task_queue`, `schedule_to_close_timeout`, `schedule_to_start_timeout`, `start_to_close_timeout`, `heartbeat_timeout`, `request_eager_execution`, `retry_policy`, `priority`

Workflow call options depend on the [start kind](#workflow-call). Every start takes `task_queue`, `workflow_execution_timeout`, `workflow_run_timeout`, `workflow_task_timeout`, `workflow_id_reuse_policy`, `retry_policy`, `priority`. A **child start** also takes `parent_close_policy`; a **client start** also takes `workflow_id_conflict_policy`. Recurring starts are **not** a call option — model them with Temporal Schedules, which TWF treats as platform configuration outside the language (see `skills/temporal-architect-design/topics/timers-scheduling.md`).

- `parent_close_policy` values: `TERMINATE` (default — child is killed when parent closes), `REQUEST_CANCEL` (child receives cancellation request), `ABANDON` (child continues independently).
- `workflow_id_reuse_policy` — what a start does when its ID belongs to a **closed** execution: `ALLOW_DUPLICATE` (start a new one), `ALLOW_DUPLICATE_FAILED_ONLY` (only if that one did not complete successfully), `REJECT_DUPLICATE` (refuse). Temporal's deprecated `TERMINATE_IF_RUNNING` is not a value; write `ALLOW_DUPLICATE` with `workflow_id_conflict_policy: TERMINATE_EXISTING`.
- `workflow_id_conflict_policy` — what a start does when its ID belongs to a **running** execution: `FAIL` (refuse), `USE_EXISTING` (join it), `TERMINATE_EXISTING` (replace it).

The two ID policies act only when starts share an ID — see [Workflow Definitions — ID Scheme](./01-workflows.md#id-scheme).

A call's `task_queue` may interpolate the caller's data (`"sandbox-{lease.sandboxId}"`). Its
parameters are runtime parameters, and it routes to a worker queue of the same shape ([Queue
matching](./03-workers-and-namespaces.md#queue-matching)). A value that is exactly one parameter
(`"{lease.queue}"`) is a learned queue, naming a member of a per-instance family. It is quoted
because `task_queue` is a `STRING`, unlike a bare [learned `id:`](./13-cross-workflow-signals.md#type-head).

Retry policy keys: `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types`. `non_retryable_error_types` takes a `list_value` of strings (error-type names that should never be retried); an empty list `[]` means "no non-retryable types". The other list-valued key is the endpoint option `allowed_caller_namespaces` ([Workers and Namespaces](./03-workers-and-namespaces.md#endpoint-options)).

Priority keys: `priority_key` (number, 1–n, lower = higher priority), `fairness_key` (string, fairness balancing key), `fairness_weight` (number, weight in [0.001, 1000])

Signal handler options: `unfinished_policy` (values: `abandon`, `warn_and_abandon`; default `warn_and_abandon`), `description` (string)

Update handler options: `unfinished_policy` (values: `abandon`, `warn_and_abandon`; default `warn_and_abandon`), `description` (string)

Query handler options: `description` (string). `unfinished_policy` does not apply — queries are synchronous and read-only, so they cannot be "unfinished".

`unfinished_policy` declares whether a handler may be silently dropped when the workflow exits while the handler is still running: `warn_and_abandon` logs a warning and drops it (the default), `abandon` drops it silently. The choice is a design-intent statement — for update handlers especially, an abandoned handler means the waiting caller receives `NotFound`, so it is rarely the right choice there.

**Example:**
```
activity ChargePayment(order) -> payment
	options:
		task_queue: "payment-workers"
		start_to_close_timeout: 60s
		retry_policy:
			maximum_attempts: 3
			initial_interval: 1s
			non_retryable_error_types: ["InvalidInput", "NotFound", "Unauthorized"]
		priority:
			priority_key: 1
			fairness_key: "high"
```

Handler declarations may carry an `options:` block at the head of the handler body, before any statements:

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
	cancelled = true

update SubmitJob(job: Job) -> (JobId):
	options:
		unfinished_policy: warn_and_abandon
	activity ValidateJob(job)
	jobId = uuid()
	return jobId
```

## Definition Default Options

Activity and workflow **definitions** may carry a `default_options:` block at the head of the definition body — the call-option defaults for every call to that definition. It is the definition-level counterpart to the call-site `options:` block above.

```
default_options_block ::= 'default_options' ':' NEWLINE INDENT option_entry+ DEDENT
```

The block contents **reuse `option_entry` verbatim** — the same value grammar and nested-block shape as a call-site `options:` block; the keys follow the rules below. Only the leading keyword and the semantics differ. `default_options` is a soft/contextual keyword: it is special only at the head of a definition body.

**Placement.**
- `activity_def`: the `default_options:` block leads the body, before any statements.
- `workflow_def`: the `default_options:` block leads the body — after only the `id_scheme:` line, if any, and before the `state:` block — a definition's defaults are its external invocation contract, which reads above its internal `state:`.

**Precedence — call-site `options:` overrides definition `default_options:`, per key.** For a given call, a key present in the call site's `options:` block wins; keys the call site omits fall back to the definition's `default_options:`. Nested blocks (`retry_policy`, `priority`) are **atomic** — a call-site `retry_policy:` replaces the definition's `retry_policy:` entirely, with no field-level deep merge. This is faithful to the SDKs (a RetryPolicy is passed as one struct) and avoids surprising cross-layer field combinations. TWF does not *compute* the merged result, except that `twf check` routes a call by its effective `task_queue` ([Workers and Namespaces](./03-workers-and-namespaces.md#resolution)) and checks a client start's effective ID policies (`ID_POLICY_INCOMPATIBLE`); the spec **states** the precedence so codegen and readers agree, and `twf check` validates each block's keys independently.

**Valid keys at definition level.** A key that describes *the operation* is defaultable; a key that describes *a particular invocation* is call-site-only.

- **Activity `default_options:`** — all activity call option keys are valid: `task_queue`, `schedule_to_close_timeout`, `schedule_to_start_timeout`, `start_to_close_timeout`, `heartbeat_timeout`, `request_eager_execution`, `retry_policy`, `priority`. None is inherently per-call.
- **Workflow `default_options:`** — all client-start option keys, including `workflow_id_conflict_policy`. `parent_close_policy` stays call-site-only: it is **relational**, describing one specific parent↔child bond, not the workflow type (the same workflow may be a child of many parents, or a root).

A `task_queue` parameter in `default_options:` is a runtime parameter, rooted in the definition's own params, and routes by shape like a call-site queue.

**A start uses the defaults its kind can carry.** A child start cannot carry a conflict policy, so the default `workflow_id_conflict_policy` applies to client starts only (`CHILD_START_CONFLICT_MISMATCH` notes a child start of a type that defaults to joining or replacing). The defaults are also the contract for starters outside the design — client code that starts the type.

A key a context cannot carry is `OPTION_MISPLACED` (see [Resolution and Errors](./11-resolution-and-errors.md#error-handling)).

The async-nexus case needs no grammar change: a workflow started via a Nexus run operation (`async Op workflow Name`) is a client start that takes its timeouts and both ID policies from the backing workflow's `default_options:` block.

**Example:**
```twf
activity ChargePayment(order: Order) -> (Payment):
	default_options:
		task_queue: "payment-workers"
		start_to_close_timeout: 60s
		retry_policy:
			maximum_attempts: 3
	activity DoCharge(order) -> payment
	return payment

workflow ProcessOrder(order: Order) -> (Result):
	id_scheme: "order-{order.id}"
	default_options:
		workflow_execution_timeout: 1h
		workflow_id_reuse_policy: REJECT_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
	state:
		condition charged
	activity ChargePayment(order) -> payment
	set charged
	close complete(Result{payment})
```

## Workflow Call

```
workflow_call ::= ['detach'] 'workflow' IDENT args ['->' result] [NEWLINE options_line]
```

Modifiers:
- `detach`: Fire-and-forget start (no result)

**Start kind.** A start becomes the Temporal operation its enclosing body allows:

| Kind | Written in | Temporal operation | Takes | Rejects (`OPTION_MISPLACED`) |
|---|---|---|---|---|
| **Child start** | a workflow body, signal handler, or update handler | `StartChildWorkflowExecution` | `parent_close_policy` | `workflow_id_conflict_policy` — a child start onto a running ID fails |
| **Client start** | a sync Nexus operation body; `async Op workflow Name` | client start | `workflow_id_conflict_policy` | `parent_close_policy` — there is no parent |

Promise-bound and awaited starts take no `options:`; they use the callee's defaults.

A start never writes the child's workflow ID — it derives from the callee's
[`id_scheme:`](./01-workflows.md#id-scheme), if any. An `id:`/`run_id:` line under a start, or a
`workflow_id:` key in its `options:`, is `ID_AT_START`.

## Nexus Call

```
nexus_call ::= ['detach'] 'nexus' IDENT IDENT '.' IDENT args ['->' result] [NEWLINE options_line]
```

Calls a nexus service operation. The three IDENTs are: Endpoint, Service.Operation (dot-separated).

- `detach`: Fire-and-forget nexus call (no result)
- Endpoint: The nexus endpoint name (defined in a namespace block)
- Service.Operation: The nexus service and operation name (dot-separated)

**Nexus call options:** `schedule_to_close_timeout`, `retry_policy`, `priority` (all nested blocks use the same sub-key schemas described above)

`task_queue` is intentionally **not** a nexus call option. Nexus routing is determined entirely by the endpoint — the namespace's endpoint declaration carries the `task_queue` that dispatch lands on. Specifying a per-call queue would compete with the endpoint contract; the parser rejects `task_queue:` on a nexus call with `unknown option key: task_queue`.

**Examples:**
```
nexus OrderEndpoint OrderService.PlaceOrder(order) -> result
nexus OrderEndpoint OrderService.GetStatus(order.id) -> status
	options:
		schedule_to_close_timeout: 30s
detach nexus NotificationEndpoint NotificationService.SendEmail(email)
```

## Signal Send

```
signal_send_stmt ::= 'signal' send_head '.' IDENT args NEWLINE [address]
send_head        ::= qualified_ref | IDENT          # type (needs address) | handle
address          ::= INDENT 'id' ':' id_value NEWLINE
                            [ 'run_id' ':' path NEWLINE ] DEDENT
id_value         ::= STRING | 'parent' | path
path             ::= IDENT ('.' IDENT)*
```

Sends a signal to another running workflow. The head is a **workflow type**, addressed by the
indented `id:` (and optional `run_id:`) lines below the send, or a **handle** — a workflow-bound
`promise` — which takes no address. The trailing IDENT names a signal the target workflow declares.
Addressing forms and their semantics are in [Cross-Workflow Signals](./13-cross-workflow-signals.md).

```twf
signal ShipItem.Shipped(event.tracking)
	id: "ship-{event.orderId}-{event.sku}"
signal ship.Shipped(t)
```

- The address must start on its own line: `signal X.Y() id: w` is a targeted parse error.
- `id:` takes one `STRING`, `parent`, or one path; anything else is `ID_VALUE_MALFORMED` — bind
  it on the line before.
- `run_id:` is optional, always a path, and only follows a literal or path `id:`.
- No `options:` under a send — no SDK has a per-send option; the slot after `run_id:` is reserved.
  Misplaced address lines are `ADDRESS_MISPLACED`.

A `.` after the name is what distinguishes a send from a signal *arrival* target (`await signal Name`) and from a handler declaration (`signal Name(params):`).

**Signal send is fire-and-forget** — a statement only, with no `await`, `promise`, or `await one` form; see [Cross-Workflow Signals — Fire-and-forget](./13-cross-workflow-signals.md#fire-and-forget).

## Promise Statement

```
promise_stmt ::= 'promise' IDENT '<-' async_target NEWLINE

async_target ::= timer_target
               | signal_target
               | update_target
               | activity_target
               | workflow_target
               | nexus_target

nexus_target ::= 'nexus' IDENT IDENT '.' IDENT args
```

Declares a non-blocking async operation. The `<-` operator visually distinguishes async declaration from sync result binding (`->`). Use `await` to wait for the promise later.

A promise is in scope from its binding to the end of the block that binds it, nested blocks included — in a workflow body, a handler body, or a sync nexus operation body. A later binding of the same name shadows it from there on, and same-named promises in sibling blocks are distinct. A handler also sees the promises bound at the top level of its workflow body, wherever in that body they are bound (the last binding of a repeated name); the workflow body does not see a handler's.

**Examples:**
```
promise p <- activity ProcessItem(input)
promise report <- workflow BuildReport(data)
promise timeout <- timer(5m)
promise approved <- signal Approved
promise addr <- update ChangeAddress
promise result <- nexus OrderEndpoint OrderService.PlaceOrder(order)
```

## Set / Unset Statements

```
set_stmt ::= 'set' IDENT NEWLINE
unset_stmt ::= 'unset' IDENT NEWLINE
```

Set or unset a named condition declared in the workflow's `state:` block. Conditions can be awaited or used in `await one` cases.

**Examples:**
```
set clusterStarted
unset clusterStarted
```

## Single Await Statement

```
await_stmt ::= 'await' await_target NEWLINE

await_target ::= timer_target
               | signal_target
               | update_target
               | activity_target
               | workflow_target
               | nexus_target
               | ident_target

timer_target ::= 'timer' '(' duration ')'

signal_target ::= 'signal' IDENT ['->' params]

update_target ::= 'update' IDENT ['->' params]

activity_target ::= 'activity' IDENT args ['->' result]

workflow_target ::= ['detach'] 'workflow' IDENT args ['->' result]

nexus_target ::= ['detach'] 'nexus' IDENT IDENT '.' IDENT args ['->' result]

ident_target ::= IDENT ['->' result]

duration ::= NUMBER ('s' | 'm' | 'h' | 'd') | IDENT
params ::= '(' IDENT (',' IDENT)* ')'
result ::= IDENT | '(' IDENT (',' IDENT)* ')'
```

Single await blocks until the specified operation completes. For signals and updates, the handler body executes first, then the await continues. For activities and workflows, the result is bound to the specified variable(s). For ident targets, the name must refer to a previously declared promise or condition.

**Examples:**
```
await timer(5m)
await signal Approved
await signal Approved -> (approver, timestamp)
await activity Process(data) -> result
await workflow Child(input) -> output
await nexus OrderEndpoint OrderService.GetStatus(id) -> status
await myPromise -> result
await clusterStarted
```

## Await All Block

```
await_all_block ::= 'await' 'all' ':' NEWLINE
                    INDENT
                    statement*
                    DEDENT
```

Executes all contained statements concurrently and waits for ALL to complete before continuing.

## Await One Block

```
await_one_block ::= 'await' 'one' ':' NEWLINE
                    INDENT
                    await_one_case+
                    DEDENT

await_one_case ::= signal_case
                 | update_case
                 | timer_case
                 | activity_case
                 | workflow_case
                 | nexus_case
                 | await_all_case
                 | ident_case

signal_case ::= 'signal' IDENT ['->' params] ':' NEWLINE
                [INDENT statement+ DEDENT]

update_case ::= 'update' IDENT ['->' params] ':' NEWLINE
                [INDENT statement+ DEDENT]

timer_case ::= 'timer' '(' duration ')' ':' NEWLINE
               [INDENT statement+ DEDENT]

activity_case ::= 'activity' IDENT args ['->' result] ':' NEWLINE
                  [INDENT statement+ DEDENT]

workflow_case ::= ['detach'] 'workflow' IDENT args ['->' result] ':' NEWLINE
                  [INDENT statement+ DEDENT]

nexus_case ::= ['detach'] 'nexus' IDENT IDENT '.' IDENT args ['->' result] ':' NEWLINE
               [INDENT statement+ DEDENT]

await_all_case ::= 'await' 'all' ':' NEWLINE
                   INDENT statement+ DEDENT

ident_case ::= IDENT ['->' result] ':' NEWLINE
               [INDENT statement+ DEDENT]

duration ::= NUMBER ('s' | 'm' | 'h' | 'd') | IDENT
params ::= '(' IDENT (',' IDENT)* ')'
result ::= IDENT | '(' IDENT (',' IDENT)* ')'
```

Waits for the FIRST case to complete (races between signals, updates, timers, activities, workflows, promises, conditions, and nested await all operations).

**Signal cases** wait for a specific signal to arrive. When the signal arrives, the handler body executes first (if defined), then the case body executes (if present). Signal parameters can be bound using `->`.

**Update cases** wait for a specific update to arrive. When the update arrives, the handler body executes and returns a value to the caller, then the case body executes (if present). Update parameters can be bound using `->`.

**Timer cases** wait for a duration to elapse. When the timer fires, the case body executes (if present).

**Activity cases** wait for an activity to complete. When the activity completes, the case body executes (if present). Activity results can be bound using `->`.

**Workflow cases** wait for a child workflow to complete. When the workflow completes, the case body executes (if present). Workflow results can be bound using `->`.

**Await all cases** wait for all statements in their body to complete. When all statements complete, the await all case wins.

**Ident cases** wait for a named promise to resolve or a named condition to become true. Promise cases may bind a result using `->`. Condition cases cannot have `-> result` bindings. The name must refer to a previously declared promise or condition.

**Case bodies are optional.** If a case has no body, the colon is still required. This is useful for consuming signals/results without additional processing:
```
await one:
	signal Ready:
	timer(5m):
		close fail("timeout")
```

The case that completes first "wins" the race, its body executes (if present), and then execution continues after the `await one` block.

**Lifecycle of non-winning cases:** When one case wins, execution continues after the `await one` block. Operations started by non-winning cases (activities, child workflows, timers) are NOT cancelled — they continue running. These pending operations are cancelled only when the workflow run ends: via `close complete`, `close fail`, `close continue_as_new`, or external cancellation. For child workflows, the `parent_close_policy` option controls behavior at parent completion (TERMINATE, REQUEST_CANCEL, or ABANDON).

## Switch Block

```
switch_block ::= 'switch' '(' expr ')' ':' NEWLINE
                 INDENT
                 switch_case+
                 [else_case]
                 DEDENT

switch_case ::= 'case' expr ':' NEWLINE
                INDENT statement* DEDENT

else_case ::= 'else' ':' NEWLINE
              INDENT statement* DEDENT
```

## If Statement

```
if_stmt ::= 'if' '(' expr ')' ':' NEWLINE
            INDENT statement* DEDENT
            ['else' ':' NEWLINE INDENT statement* DEDENT]
```

## For Statement

```
for_stmt ::= 'for' [for_header] ':' NEWLINE
             INDENT statement* DEDENT

for_header ::= '(' expr ')' | '(' IDENT 'in' expr ')'
```

- No header: infinite loop
- `(expr)`: conditional loop (while expr)
- `(item in items)`: iteration loop

## Close Statement

```
close_stmt ::= 'close' ('complete' | 'fail' | 'continue_as_new') ['(' args ')'] NEWLINE
```

Terminates workflow execution with an explicit exit state. Only valid in workflow context (not in activities or queries).

- `close complete` - Normal successful completion
- `close complete(Result{...})` - Completion with a return value
- `close fail` - Terminates workflow in failed state
- `close fail(Error{...})` - Failure with error data
- `close continue_as_new(args)` - Resets workflow history and continues with new arguments (for long-running workflows)

**Important:** Signals and updates cannot call `close` - they can only mutate state. Only the main workflow body can terminate execution using `close`.

**Note:** `return` is still valid in queries (which must return values without terminating the workflow) and can be used in workflows for backward compatibility, but `close` is preferred for workflow termination as it makes the intent explicit.

## Return Statement

```
return_stmt ::= 'return' [expr] NEWLINE
```

Used in queries and activities to return values. In workflows, prefer `close` for termination.

## Break and Continue

```
break_stmt ::= 'break' NEWLINE
continue_stmt ::= 'continue' NEWLINE
```

## Assignment

```
assignment ::= IDENT '=' expr NEWLINE
```

A line that starts no other statement is taken as a raw line (`raw_stmt`): an assignment, a call
such as `notify(x)`, or pseudocode, kept as its source text. In a workflow context (a workflow
body, a signal, query or update handler, a nexus operation body, and every block nested in them) a
raw line may not begin with a keyword: `options = {}` or `update Name` there is a syntax error. An
activity body is free-form pseudocode, so a keyword may begin a raw line there (`fail with X if
…`); the [temporal keywords](./10-context-restrictions.md) are still rejected.

## Heartbeat (Activity-only)

```
heartbeat_stmt ::= 'heartbeat' '(' [arg_list] ')' NEWLINE
```

The `heartbeat()` primitive is only available in activity bodies. It reports progress to the Temporal service, allowing activities to be resumed if they fail mid-execution. Optional arguments can include progress details.
