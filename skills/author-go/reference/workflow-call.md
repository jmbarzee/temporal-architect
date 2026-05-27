# workflow call (child)

## DSL

```twf
workflow ShipOrder(order) -> shipResult
```

## Go

```go
var shipResult ShipResult
err := workflow.ExecuteChildWorkflow(ctx, ShipOrder, order).Get(ctx, &shipResult)
if err != nil {
    return Result{}, err
}
```

## Notes

- The child workflow function is passed by reference — `workflow.ExecuteChildWorkflow(ctx, FuncName, args...)`
- `ctx` must carry child workflow options; see [options.md](./options.md) for setting `ChildWorkflowOptions`
- For fire-and-forget, see [detach.md](./detach.md)
- For cross-namespace, see [nexus.md](./nexus.md)

## When to use

- **Use a child workflow when:** the sub-process needs its own event history (parent history has a 51,200 event / 50 MB limit), independent retry/timeout policies, a different task queue, separate cancellation scope (via `ParentClosePolicy`), or represents a composite operation orchestrating multiple steps
- **Use an activity when:** the operation is a single action on an external system (API call, DB write, message send). "When in doubt, use an Activity" — Temporal's official recommendation
- Activities add events to the parent's history; child workflows get their own independent history
- Child workflows cannot share state with the parent — communication is through signals only
- Do NOT use child workflows solely for code organization — use Go packages and functions instead

## Pitfalls

- Default `ParentClosePolicy` is `TERMINATE` (child is killed immediately) — if the parent completes, fails, or times out, the child is forcefully terminated. Set `REQUEST_CANCEL` (child receives a cancellation request and can handle it gracefully) or `ABANDON` (child continues running independently) explicitly when the child should outlive the parent. See [options.md](./options.md) for the DSL-to-Go mapping
- If the parent completes before the `ChildWorkflowExecutionStarted` event is recorded, the child may never spawn. Always call `childFuture.GetChildWorkflowExecution().Get(ctx, nil)` to confirm the child started — see [detach.md](./detach.md)
