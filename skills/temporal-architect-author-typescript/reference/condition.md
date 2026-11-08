# condition

| DSL | TypeScript |
|-----|------------|
| `state:` `condition jobReady` | `let jobReady = false` at the top of the workflow function |
| `set jobReady` / `unset jobReady` | `jobReady = true` / `jobReady = false` |
| `await jobReady` | `await condition(() => jobReady)` |

- `condition` from `@temporalio/workflow` (`workflow/src/workflow.ts`).
- A condition as an `await one:` case, a bounded wait included, → its `boolean` in the race's predicate ([await-one.md](./await-one.md#cases)), not `condition(fn, timeout)`.
