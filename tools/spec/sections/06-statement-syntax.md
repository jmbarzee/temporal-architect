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

value ::= STRING | DURATION | NUMBER | IDENT

DURATION ::= NUMBER ('ms' | 's' | 'm' | 'h' | 'd')
NUMBER ::= [0-9]+ ['.' [0-9]+]
```

Options blocks use indentation-based nesting (same as the rest of TWF). Each key-value pair goes on its own line. Nested blocks (like `retry_policy`) use deeper indentation.

**Allowed keys per context:**

Activity call options: `task_queue`, `schedule_to_close_timeout`, `schedule_to_start_timeout`, `start_to_close_timeout`, `heartbeat_timeout`, `request_eager_execution`, `retry_policy`, `priority`

Workflow call options: `task_queue`, `workflow_execution_timeout`, `workflow_run_timeout`, `workflow_task_timeout`, `parent_close_policy`, `workflow_id_reuse_policy`, `cron_schedule`, `retry_policy`, `priority`. `parent_close_policy` values: `TERMINATE` (default — child is killed when parent closes), `REQUEST_CANCEL` (child receives cancellation request), `ABANDON` (child continues independently). `workflow_id_reuse_policy` values: `ALLOW_DUPLICATE`, `ALLOW_DUPLICATE_FAILED_ONLY`, `REJECT_DUPLICATE`, `TERMINATE_IF_RUNNING`.

Retry policy keys: `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types`

Priority keys: `priority_key` (number, 1–n, lower = higher priority), `fairness_key` (string, fairness balancing key), `fairness_weight` (number, weight in [0.001, 1000])

**Example:**
```
activity ChargePayment(order) -> payment
    options:
        task_queue: "payment-workers"
        start_to_close_timeout: 60s
        retry_policy:
            maximum_attempts: 3
            initial_interval: 1s
        priority:
            priority_key: 1
            fairness_key: "high"
```

## Workflow Call

```
workflow_call ::= ['detach'] 'workflow' IDENT args ['->' result] [NEWLINE options_line]
```

Modifiers:
- `detach`: Fire-and-forget child workflow (no result)

## Nexus Call

```
nexus_call ::= ['detach'] 'nexus' IDENT IDENT '.' IDENT args ['->' result] [NEWLINE options_line]
```

Calls a nexus service operation. The three IDENTs are: Endpoint, Service.Operation (dot-separated).

- `detach`: Fire-and-forget nexus call (no result)
- Endpoint: The nexus endpoint name (defined in a namespace block)
- Service.Operation: The nexus service and operation name (dot-separated)

**Nexus call options:** `schedule_to_close_timeout`, `retry_policy`, `priority` (all nested blocks use the same sub-key schemas described above)

**Examples:**
```
nexus OrderEndpoint OrderService.PlaceOrder(order) -> result
nexus OrderEndpoint OrderService.GetStatus(order.id) -> status
    options:
        schedule_to_close_timeout: 30s
detach nexus NotificationEndpoint NotificationService.SendEmail(email)
```

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

## Heartbeat (Activity-only)

```
heartbeat_stmt ::= 'heartbeat' '(' [arg_list] ')' NEWLINE
```

The `heartbeat()` primitive is only available in activity bodies. It reports progress to the Temporal service, allowing activities to be resumed if they fail mid-execution. Optional arguments can include progress details.
