# condition

| DSL | Java |
|-----|------|
| `state:` `condition jobReady` | `private boolean jobReady;` on the workflow impl |
| `set jobReady` / `unset jobReady` | `jobReady = true` / `jobReady = false` |
| `await jobReady` | `Workflow.await(() -> jobReady)` |

- `Workflow.await` (`workflow/Workflow.java:898`) re-checks its predicate on every state transition, so the predicate only reads (`workflow/Workflow.java:891-893`).
- A condition as an `await one:` case, a bounded wait included, → its `boolean` in the race's predicate ([await-one.md](./await-one.md#cases)), not `Workflow.await(timeout, c)`.
