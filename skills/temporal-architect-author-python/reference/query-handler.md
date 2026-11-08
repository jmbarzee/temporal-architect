# query handler

```twf
query GetStatus() -> (string):
	options:
		description: "Current order status"
	return status
```

```python
@workflow.query(name="GetStatus", description="Current order status")
def get_status(self) -> str:
    return self.status
```

- `@workflow.query(name=…)` on a plain `def`, params positional; an `async def` query is deprecated (`temporalio/workflow/_handlers.py:184-226`).
- `description` is the only option: `unfinished_policy` does not apply to a synchronous, read-only handler.
- A query is read-only and never blocks: `temporal-developer` `references/python/patterns.md` § Queries.
