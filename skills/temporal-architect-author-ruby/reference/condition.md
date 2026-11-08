# condition

| DSL | Ruby |
|-----|------|
| `state:` `condition jobReady` | `@job_ready = false` in `initialize` |
| `set jobReady` / `unset jobReady` | `@job_ready = true` / `@job_ready = false` |
| `await jobReady` | `Temporalio::Workflow.wait_condition { @job_ready }` |

- `wait_condition` (`workflow.rb:547`) re-checks its block on every pass of the scheduler, so the block only reads (`workflow.rb:530-531`). It takes no `timeout:`.
- A condition as an `await one:` case, a bounded wait included, → its value in the race's condition ([await-one.md](./await-one.md#cases)), not `Workflow.timeout(secs) { wait_condition { … } }`.
