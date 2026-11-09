# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```haskell
data OrderEnv = OrderEnv {validator :: Validator}

validateOrder :: ProvidedActivity OrderEnv (Order -> Activity OrderEnv ValidateResult)
validateOrder = provideActivity JSON "ValidateOrder" \order -> do
  env <- ask
  liftIO (validate env.validator order)
```

- A `ProvidedActivity` value named for the activity in lowerCamelCase, built by `provideActivity JSON "Name"` with the `.twf` name as its string ([SKILL.md](../SKILL.md#wire-names), `Activity.hs:99-129`). Params are positional, one payload each; no DSL return type → `Activity env ()`.
- `Activity env` runs in `IO` (`MonadIO`, `MonadUnliftIO`) and reads its environment with `ask` (`Activity/Definition.hs:169-185,213-214`). With no dependencies, `env` is `()`, as the corpus's `compose :: ProvidedActivity () (Text -> Activity () Text)`.
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats ([heartbeat.md](./heartbeat.md)), as an asynchronous `ActivityCancelReason` exception (`Activity.hs:29-33`).

## Activity Implementation Pattern

Generate all four pieces:

1. **Environment record** — one field per external dependency; the worker's `configure env` supplies it ([worker.md](./worker.md)), and every activity on that worker shares it.
2. **Activity values** — thin translation: validate input, call the dependency, translate output.
3. **Dependency interfaces** — a record of functions in `IO` shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real package integration: client construction, request/response conversion, error handling.

Values and interfaces are mechanical; concrete implementations need the package knowledge from dependency resolution.
