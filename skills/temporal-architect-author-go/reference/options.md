# options

Option keys map to Go fields by name (`start_to_close_timeout` → `StartToCloseTimeout`); `retry_policy:` → `&temporal.RetryPolicy{...}` (a pointer). When a call has no `options:` block, set a default `ActivityOptions` with `StartToCloseTimeout` on `ctx` near the top of the workflow function.

## Activity options

```twf
activity UnreliableService(data) -> result
    options:
        start_to_close_timeout: 2m
        retry_policy:
            maximum_attempts: 5
            initial_interval: 1s
            backoff_coefficient: 2.0
            maximum_interval: 60s
```

```go
actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
    StartToCloseTimeout: 2 * time.Minute,
    RetryPolicy: &temporal.RetryPolicy{
        MaximumAttempts:        5,
        InitialInterval:       1 * time.Second,
        BackoffCoefficient:    2.0,
        MaximumInterval:       60 * time.Second,
    },
})
var result ServiceResult
err := workflow.ExecuteActivity(actCtx, UnreliableService, data).Get(ctx, &result)
```

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
    options:
        workflow_execution_timeout: 1h
        parent_close_policy: REQUEST_CANCEL
        retry_policy:
            maximum_attempts: 3
```

```go
childCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
    WorkflowExecutionTimeout: 1 * time.Hour,
    ParentClosePolicy:        enumspb.PARENT_CLOSE_POLICY_REQUEST_CANCEL,
    RetryPolicy: &temporal.RetryPolicy{
        MaximumAttempts: 3,
    },
})
var childResult ChildResult
err := workflow.ExecuteChildWorkflow(childCtx, ChildWorkflow, input.Data).Get(ctx, &childResult)
```

`ParentClosePolicy` is an `enumspb.ParentClosePolicy`: `PARENT_CLOSE_POLICY_TERMINATE` (default), `PARENT_CLOSE_POLICY_REQUEST_CANCEL`, `PARENT_CLOSE_POLICY_ABANDON`.

## Nexus operation options

Passed inline to `ExecuteOperation` — no context wrapping. Fields: `ScheduleToCloseTimeout` (primary) and `CancellationType` (experimental).

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
    options:
        schedule_to_close_timeout: 1h
```

```go
c := workflow.NewNexusClient("BillingEndpoint", "BillingService")
var paymentResult PaymentResult
fut := c.ExecuteOperation(ctx, ChargePaymentOp, payment, workflow.NexusOperationOptions{
    ScheduleToCloseTimeout: 1 * time.Hour,
})
err := fut.Get(ctx, &paymentResult)
```

## Definition-level `default_options:`

A `default_options:` block on an `activity` or `workflow` definition supplies defaults for every call of it, in the call-site `options:` grammar.

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

    # Uses the activity's default_options unchanged.
    activity ChargeCard(order.card, order.total) -> receipt

    # Per-key override; the call-site retry_policy atomic-replaces the default.
    activity ChargeCard(order.card, order.tip) -> tipReceipt
        options:
            retry_policy:
                maximum_attempts: 1
```

- **Placement**: activity — head of the body; workflow — first body element, before `state:`.
- **Keys**: activity `default_options:` takes every activity call-option key; workflow `default_options:` every workflow call-option key **except** `parent_close_policy` (call-site only — it describes one parent↔child bond, not the type). `cron_schedule` is not an option key.
- **Precedence**: call-site `options:` overrides per key; nested blocks (`retry_policy`, `priority`) **atomic-replace** — no deep merge.

Go has no single construct for it: build the base options value once and apply it near each call; an override is a struct copy with fields replaced, which is exactly the per-key, atomic-replace rule.

```go
chargeDefaults := workflow.ActivityOptions{
    StartToCloseTimeout: 30 * time.Second,
    RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 5},
}

ctxDefault := workflow.WithActivityOptions(ctx, chargeDefaults)
err := workflow.ExecuteActivity(ctxDefault, ChargeCard, order.Card, order.Total).Get(ctx, &receipt)

tipOpts := chargeDefaults
tipOpts.RetryPolicy = &temporal.RetryPolicy{MaximumAttempts: 1}
ctxTip := workflow.WithActivityOptions(ctx, tipOpts)
err = workflow.ExecuteActivity(ctxTip, ChargeCard, order.Card, order.Tip).Get(ctx, &tipReceipt)
```

## Timeouts

- **`StartToCloseTimeout`** — one activity attempt; resets on each retry. The primary way a worker crash is detected; Temporal recommends always setting it.
- **`ScheduleToCloseTimeout`** — total wall-clock from scheduling, across all retries; does not reset. Caps total time under exponential backoff.
- An activity needs at least one of the two — omitting both is a runtime error.
- **`WorkflowExecutionTimeout`** — the whole execution, including retries and Continue-As-New chains. Set in `client.StartWorkflowOptions` or `workflow.ChildWorkflowOptions`, not in `ActivityOptions`.

## Retry pitfalls

- Activities retry by default, server defaults: initial interval 1s, backoff 2.0, max interval 100s, unlimited attempts. With no `RetryPolicy`, these apply — a common surprise. Workflows do not retry by default.
- `MaximumAttempts: 1` is one attempt total (no retries); `0` (the default) is unlimited.
- `BackoffCoefficient: 1.0` gives fixed intervals; the interval is `InitialInterval * BackoffCoefficient^(attempt-1)`.
