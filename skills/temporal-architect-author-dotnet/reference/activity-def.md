# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```csharp
public class OrderActivities(IValidator validator)
{
    [Activity]
    public async Task<ValidateResult> ValidateOrderAsync(Order order) =>
        await validator.ValidateAsync(order);
}
```

- An `[Activity]` method named as the `.twf` names it, `Async` trimmed when it returns a `Task`, else `[Activity("Name")]` ([SKILL.md](../SKILL.md#wire-names)). Params are positional; no DSL return type → `void` or `Task`.
- With no dependencies, a `static` method suffices, as the corpus's `[Activity] public static string Compose(string name)`.
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats: `temporal-developer` `references/dotnet/gotchas.md` § Not Handling Activity Cancellation.

## Activity Implementation Pattern

Generate all four pieces:

1. **Activities class** — one constructor parameter per external dependency; the worker registers an instance with `AddAllActivities(instance)` ([worker.md](./worker.md)).
2. **Activity methods** — thin translation: validate input, call the interface, translate output.
3. **Interfaces** — shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real SDK integration: client construction, request/response conversion, error handling.

Methods and interfaces are mechanical; concrete implementations need the SDK knowledge from dependency resolution.
