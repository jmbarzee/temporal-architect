# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```python
class OrderActivities:
    def __init__(self, validator: Validator) -> None:
        self.validator = validator

    @activity.defn(name="ValidateOrder")
    async def validate_order(self, order: Order) -> ValidateResult:
        return await self.validator.validate(order)
```

- A function or method under `@activity.defn(name=…)`, the `.twf` name ([SKILL.md](../SKILL.md#wire-names)). Params are positional; no DSL return type → `-> None`.
- With no dependencies, plain module functions suffice, as the corpus's `@activity.defn(name="Compose") def compose(name: str) -> str`.
- `async def` or plain `def` is an SDK idiom: `temporal-developer` `references/python/sync-vs-async.md`. A plain `def` activity needs the worker's `activity_executor` ([worker.md](./worker.md)).
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats: `temporal-developer` `references/python/patterns.md` § Activity Heartbeat Details.

## Activity Implementation Pattern

Generate all four pieces:

1. **Class** — one constructor parameter per external dependency; the worker registers its bound methods (`[acts.validate_order]`, [worker.md](./worker.md)).
2. **Activity methods** — thin translation: validate input, call the protocol, translate output.
3. **Protocols** — `typing.Protocol`s shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real SDK integration: client construction, request/response conversion, error handling.

Methods and protocols are mechanical; concrete implementations need the SDK knowledge from dependency resolution.
