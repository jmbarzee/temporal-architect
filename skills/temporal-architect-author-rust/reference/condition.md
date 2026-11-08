# condition

| DSL | Rust |
|-----|------|
| `state:` `condition jobReady` | `job_ready: bool` on the `#[workflow]` struct |
| `set jobReady` / `unset jobReady` | `self.job_ready = true` in a sync handler; `ctx.state_mut(\|s\| s.job_ready = true)` in async code |
| `await jobReady` | `ctx.wait_condition(\|s\| s.job_ready).await?` |

- `ctx.wait_condition` re-checks its closure, which only reads, whenever it is polled; every `state_mut` wakes it (`crates/workflow/src/workflow_context.rs:2516-2521,2543-2585`). It returns `Err` when the workflow is cancelled.
- A condition as an `await one:` case → a `ctx.wait_condition` arm ([await-one.md](./await-one.md#cases)).
