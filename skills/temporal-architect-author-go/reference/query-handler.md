# query handler

## DSL

```twf
query GetStatus() -> (string):
    return status
```

## Go

```go
err := workflow.SetQueryHandler(ctx, "GetStatus", func() (string, error) {
    return status, nil
})
if err != nil {
    return Result{}, err
}
```

## Notes

- Query handlers always return `(ReturnType, error)`
- Query handlers must not modify workflow state — read-only
- Query handlers have no `workflow.Context` parameter in their signature
- With params: `func(param1 Type1, param2 Type2) (ReturnType, error)`
- Non-deterministic operations (e.g., ranging over a map) are permitted in query handlers — they execute outside the replay path
- Register queries at the very start of the workflow function, before any blocking calls. If a query arrives before the handler is registered during replay, the caller receives an `unknown queryType` error

## Pitfalls

- **No blocking operations.** Query handlers must not call `workflow.Go()`, `workflow.NewChannel()`, `Channel.Get()`, `Future.Get()`, or `workflow.Await()`. Violation causes a panic caught by the SDK, returning `QueryFailedError` to the caller
- **No activities or commands.** Query handlers cannot execute activities, schedule timers, start child workflows, or produce any workflow command. This also produces `QueryFailedError`
- These restrictions exist because queries are dispatched outside the normal workflow execution context — they cannot participate in the event history
