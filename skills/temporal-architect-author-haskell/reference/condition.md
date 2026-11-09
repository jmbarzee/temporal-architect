# condition

| DSL | Haskell |
|-----|---------|
| `state:` `condition jobReady` | `jobReady <- newStateVar False`, at the top of the workflow body |
| `set jobReady` / `unset jobReady` | `writeStateVar jobReady True` / `writeStateVar jobReady False` |
| `await jobReady` | `waitCondition (readStateVar jobReady)` |

- `waitCondition` (`Workflow.hs:1594-1620`) takes a `Condition Bool`, which may only read `StateVar`s (`Workflow/Internal/Monad.hs:609-614`), and re-runs it whenever a `StateVar` it read is written (`Workflow/Internal/Monad.hs:652-674`), and only then.
- A condition as an `await one:` case, a bounded wait included, is a `race` branch, `waitCondition (readStateVar jobReady)` ([await-one.md](./await-one.md#cases)).
