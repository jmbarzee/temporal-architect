# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```php
#[ActivityInterface]
final class OrderActivities
{
    public function __construct(private readonly Validator $validator) {}

    #[ActivityMethod(name: 'ValidateOrder')]
    public function validateOrder(Order $order): ValidateResult
    {
        return $this->validator->validate($order);
    }
}
```

- An `#[ActivityMethod(name: 'Name')]` method on an `#[ActivityInterface]` class or interface whose `prefix` stays `''`, its default (`Activity/ActivityInterface.php:50-54`): the prefix is prepended even to an explicit name ([SKILL.md](../SKILL.md#wire-names)). Params are positional; no DSL return type → `void`.
- With no dependencies, the class needs no constructor, as the corpus's `BatchActivities`.
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats: `temporal-developer` [`gotchas.md` § Not Handling Activity Cancellation](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#not-handling-activity-cancellation).

## Activity Implementation Pattern

Generate all four pieces:

1. **Activities class** — one constructor parameter per external dependency; the worker registers it with `registerActivity(OrderActivities::class, fn () => new OrderActivities($validator))` (`Worker/WorkerInterface.php:74`; [worker.md](./worker.md)). Activity processes are long-lived: `temporal-developer` [`gotchas.md` § Shared State in Long-Lived Processes](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#shared-state-in-long-lived-processes).
2. **Activity methods** — thin translation: validate input, call the interface, translate output.
3. **Interfaces** — shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real SDK integration: client construction, request/response conversion, error handling.

Methods and interfaces are mechanical; concrete implementations need the SDK knowledge from dependency resolution.
