# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```perl
# OrderActivities.pm
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Activity::Definition;

class OrderActivities :isa(Temporalio::Activity::Definition) {
    field $validator :param;

    async method validate_order :Defn('ValidateOrder') ($order) {
        return await $validator->validate($order);
    }
}

1;
```

- A `:Defn('Name')` method on a `Temporalio::Activity::Definition` subclass, alone in its `.pm` ([idioms.md](./idioms.md)); without the name it registers the method name as written ([SKILL.md](../SKILL.md#wire-names)). Params are positional; no DSL return type → `return;`.
- An `async method` runs on the worker's event loop; a plain `method` runs blocking code in a fork pool sized by the worker's `sync_activity_workers` (`README.md:880-902,982-988`). Pick by the dependency: an async client → `async method`, a blocking one → `method`.
- With no dependencies, the class holds no fields, as the corpus's `async method compose :Defn('Compose') ($name) { return "Greetings, $name" }`.
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats: sdk-perl `README.md` § Heartbeating and cancellation (`:934-967`).

## Activity Implementation Pattern

Generate all four pieces:

1. **Activities class** — one `field ... :param` per external dependency; the worker registers a built instance, `activities => [OrderActivities->new(validator => $v)]`, so every call shares it (`Worker/ActivityRegistry.pm:60-64`). A class name instead registers a fresh `->new` per call (`:67-84,102`), so only a class with no `:param` fields is registered by name ([worker.md](./worker.md)).
2. **Activity methods** — thin translation: validate input, call the dependency, translate output.
3. **Interfaces** — the methods each dependency must provide, shaped by what the activities need and informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)); Perl checks them only by duck typing, so a test double needs the same method names.
4. **Concrete implementations** — the real integration: client construction, request/response conversion, error handling.

Methods and interfaces are mechanical; concrete implementations need the knowledge from dependency resolution.
