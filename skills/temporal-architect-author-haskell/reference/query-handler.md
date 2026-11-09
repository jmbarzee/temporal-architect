# query handler

```twf
query GetStatus() -> (string):
	return status
```

```haskell
getStatusQuery :: KnownQuery '[] Text
getStatusQuery = KnownQuery "GetStatus" JSON

-- in the workflow body:
setQueryHandler getStatusQuery (readStateVar status)
```

- A `KnownQuery` value per query, `KnownQuery "Name" JSON`, its type listing the params, positional as for a [signal](./signal-handler.md), then the result (`Workflow/Query.hs:24-29`). `setQueryHandler` registers it in the workflow body (`Workflow.hs:1232-1241`).
- The handler runs in the `Query` monad, which can only read `StateVar`s (`Workflow/Internal/Monad.hs:715-722`): it cannot block, write state or call anything, so a read-only, non-blocking query is enforced by its type. What it returns lives in `StateVar`s, never in local bindings of the workflow body.
- `description`, a query's only option, is unsupported at the pin: `KnownQuery` holds only a name and a codec (`Workflow/Query.hs:24-29`).
