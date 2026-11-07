# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```ts
export interface Deps {
  validator: Validator;
}

export function createActivities(deps: Deps) {
  return {
    async ValidateOrder(order: Order): Promise<ValidateResult> {
      return await deps.validator.validate(order);
    },
  };
}
```

- An `async` function whose property name is the `.twf` name ([SKILL.md](../SKILL.md#wire-names)). Params are positional; no DSL return type → `Promise<void>`.
- With no dependencies, plain exported functions suffice, as the corpus's `export async function Compose(name: string)`.
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats: `temporal-developer` `references/typescript/gotchas.md` § Cancellation.

## Activity Implementation Pattern

Generate all four pieces:

1. **Factory** — `createActivities(deps)`, one `Deps` field per external dependency, returning the activities object the worker registers ([worker.md](./worker.md)).
2. **Activity functions** — thin translation: validate input, call the interface, translate output.
3. **Interfaces** — shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real SDK integration: client construction, request/response conversion, error handling.

Functions and interfaces are mechanical; concrete implementations need the SDK knowledge from dependency resolution.
