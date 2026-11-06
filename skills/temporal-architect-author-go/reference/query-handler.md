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
- Register at the very start of the workflow, before any blocking call.
- A query is read-only and never blocks: `temporal-developer` `references/go/patterns.md` § Queries.
