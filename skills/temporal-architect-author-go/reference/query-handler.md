# query handler

```twf
query GetStatus() -> (string):
    options:
        description: "Current order status"
    return status
```

```go
err := workflow.SetQueryHandlerWithOptions(ctx, "GetStatus",
    func() (string, error) { return status, nil },
    workflow.QueryHandlerOptions{Description: "Current order status"},
)
if err != nil {
    return Result{}, err
}
```

- Signature: `func(params...) (ReturnType, error)` — no `workflow.Context`.
- Without `options:`, use plain `workflow.SetQueryHandler(ctx, name, fn)` (`QueryHandlerOptions` is Experimental). `description` is the only option TWF admits — `unfinished_policy` does not apply to a synchronous, read-only handler.
- Register at the very start of the workflow, before any blocking call; a query that arrives first during replay gets `unknown queryType`.
- Queries run outside the event history: read-only, and non-deterministic code (e.g. ranging over a map) is allowed. They must not block (`workflow.Go`, `workflow.NewChannel`, `Channel.Get`, `Future.Get`, `workflow.Await`) or produce commands (activities, timers, child workflows) — either fails the query with `QueryFailedError`.
