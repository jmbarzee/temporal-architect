# condition

| DSL | C# |
|-----|----|
| `state:` `condition jobReady` | `private bool jobReady;` on the workflow class |
| `set jobReady` / `unset jobReady` | `jobReady = true` / `jobReady = false` |
| `await jobReady` | `await Workflow.WaitConditionAsync(() => jobReady)` |

- `Workflow.WaitConditionAsync` (`Workflows/Workflow.cs:1352`).
- A condition as an `await one:` case, a bounded wait included, → its `bool` in the race's predicate ([await-one.md](./await-one.md#cases)), not `WaitConditionAsync(c, timeout)`.
