# query handler

```twf
query GetStatus() -> (string):
	options:
		description: "Current order status"
	return status
```

```java
// on the @WorkflowInterface:
@QueryMethod(name = "GetStatus", description = "Current order status")
String getStatus();

// in the impl:
@Override
public String getStatus() {
  return status;
}
```

- `@QueryMethod(name = …)` (`workflow/QueryMethod.java:28`), never `void` (`common/metadata/POJOWorkflowMethod.java:47`); params positional.
- `description` (`workflow/QueryMethod.java:31`) is the only attribute: `unfinished_policy` does not apply to a read-only handler that never blocks (`workflow/QueryMethod.java:13-14`). Queries: `temporal-developer` `references/java/patterns.md` § Queries.
