# query handler

```twf
query GetStatus() -> (string):
	options:
		description: "Current order status"
	return status
```

```csharp
[WorkflowQuery(Description = "Current order status")]
public string GetStatus() => status;
```

- A `[WorkflowQuery]` method, or a property when it takes no params (`Workflows/WorkflowQueryDefinition.cs:110,167`); synchronous, params positional.
- `Description` is its only option (`Workflows/WorkflowQueryAttribute.cs:45`): `unfinished_policy` does not apply to a synchronous, read-only handler.
- A query is read-only and never blocks: `temporal-developer` `references/dotnet/patterns.md` § Queries.
