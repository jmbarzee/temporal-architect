# condition

| DSL | Swift |
|-----|------|
| `state:` `condition jobReady` | `var jobReady = false` on the `@Workflow` struct |
| `set jobReady` / `unset jobReady` | `jobReady = true` / `jobReady = false` |
| `await jobReady` | `try await context.condition { $0.jobReady }` |

- `context.condition(_:)` (`Temporal/Worker/Workflow/WorkflowContext.swift:383`) re-reads its predicate each time the executor runs, so the predicate only reads (`:359-360`). Satisfied conditions resume one at a time, in the order they were registered (`:362-365`).
- State is the struct's stored `var`s, which the macro boxes so handlers and `run` share them (`Temporal/Macros/WorkflowMacro.swift:202`, `TemporalMacros/WorkflowSignalMacro.swift:96-98`). A comment on a state `var` goes on the line above it: a trailing one breaks the macro's expansion, as the corpus's `Batch` notes.
- A condition as an `await one:` case, a bounded wait included, → its `Bool` in the round's predicate ([await-one.md](./await-one.md#cases)), not `context.timeout`, which lets the timer win a tie.
