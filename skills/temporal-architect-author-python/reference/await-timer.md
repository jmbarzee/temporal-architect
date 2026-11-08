# await timer

```twf
await timer(5m)
```

```python
await workflow.sleep(timedelta(minutes=5))
```

- `workflow.sleep(duration: float | timedelta)` (`temporalio/workflow/_context.py:1003`) takes the `.twf` duration as a `timedelta` (`30s` → `timedelta(seconds=30)`, `1d` → `timedelta(days=1)`) or seconds. A variable duration passes straight through: `await workflow.sleep(backoff)`.
- A cancelled workflow raises `asyncio.CancelledError` from it: `temporal-developer` `references/python/patterns.md` § Cancellation Handling.
- Inside `await one:` or a `promise`, see [await-one.md](./await-one.md).
