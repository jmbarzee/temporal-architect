# condition

| DSL | Go |
|-----|----|
| `state:` `condition jobReady` | `jobReady := false` at workflow scope |
| `set jobReady` / `unset jobReady` | `jobReady = true` / `jobReady = false` |
| `await jobReady` | `err := workflow.Await(ctx, func() bool { return jobReady })` |

- Bounded waits: `temporal-developer` `references/go/patterns.md` § Wait Condition with Timeout.
- A condition as an `await one:` case → its `bool` in the race's `Await` predicate; see [await-one.md](./await-one.md#cases).
