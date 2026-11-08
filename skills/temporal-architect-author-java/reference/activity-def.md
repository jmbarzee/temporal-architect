# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```java
// OrderActivities.java
@ActivityInterface
public interface OrderActivities {
  ValidateResult validateOrder(Order order);
}

// OrderActivitiesImpl.java
public class OrderActivitiesImpl implements OrderActivities {
  private final Validator validator;

  public OrderActivitiesImpl(Validator validator) {
    this.validator = validator;
  }

  @Override
  public ValidateResult validateOrder(Order order) {
    return validator.validate(order);
  }
}
```

- A method of an `@ActivityInterface` interface, named as the `.twf` names it in camelCase (`validateOrder` registers `ValidateOrder`), else `@ActivityMethod(name = "…")` ([SKILL.md](../SKILL.md#wire-names)). Params are positional; no DSL return type → `void`.
- An activity is always an interface method implemented on an instance: the SDK skips static interface methods (`common/metadata/POJOActivityInterfaceMetadata.java:211-217`). One interface may hold several activities; the corpus's `BatchActivities` holds `count` and `store`.
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats: `temporal-developer` `references/java/gotchas.md` § Not Handling Activity Cancellation.

## Activity Implementation Pattern

Generate all four pieces:

1. **Activities impl** — one constructor parameter per external dependency; the worker registers an instance with `registerActivitiesImplementations(instance)` ([worker.md](./worker.md)).
2. **Activity methods** — thin translation: validate input, call the interface, translate output.
3. **Interfaces** — shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real library integration: client construction, request/response conversion, error handling.

Methods and interfaces are mechanical; concrete implementations need the library knowledge from dependency resolution.
