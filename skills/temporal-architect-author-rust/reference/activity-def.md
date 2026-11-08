# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```rust
pub struct OrderActivities {
    validator: Arc<dyn Validator + Send + Sync>,
}

#[activities]
impl OrderActivities {
    #[activity(name = "ValidateOrder")]
    pub async fn validate_order(
        self: Arc<Self>,
        _ctx: ActivityContext,
        order: Order,
    ) -> Result<ValidateResult, ActivityError> {
        Ok(self.validator.validate(&order).await?)
    }
}
```

- A method of an `#[activities]` impl, always with `#[activity(name = "…")]` set to the `.twf` name, since the default is `"Type::method"` ([SKILL.md](../SKILL.md#wire-names)). Params after the `ActivityContext` are positional, at most 6, and the macro carries several as one `MultiArgsN` (`macros/src/activities_definitions.rs:229-241,265-278`); no DSL return type → `Result<(), ActivityError>`.
- A method with no receiver holds no state; one holding dependencies takes `self: Arc<Self>` (`activities_definitions.rs:96-112,185-199`). One impl may hold several activities; the corpus's `BatchActivities` holds `count` and `store`.
- An activity implemented in another SDK is declared, not implemented: an `#[activity_definitions]` impl whose methods omit the `ActivityContext` and have a body of `unimplemented!()`, called like any other and never registered (`sdk/src/activities.rs:31-47`).
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats ([heartbeat.md](./heartbeat.md)).

## Activity Implementation Pattern

Generate all four pieces:

1. **Activities struct** — one field per external dependency; the worker registers an instance with `.register_activities(instance)` ([worker.md](./worker.md)).
2. **Activity methods** — thin translation: validate input, call the trait, translate output.
3. **Traits** — shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real crate integration: client construction, request/response conversion, error handling.

Methods and traits are mechanical; concrete implementations need the crate knowledge from dependency resolution.
