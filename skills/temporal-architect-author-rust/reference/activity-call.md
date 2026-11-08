# activity call

```twf
activity ValidateOrder(order) -> validated
```

```rust
let validated = ctx
    .execute_activity(
        OrderActivities::validate_order,
        order,
        ActivityOptions::start_to_close_timeout(Duration::from_secs(60)),
    )
    .await?;
```

- `ctx.execute_activity(definition, input, options)` (`workflow/src/workflow_context.rs:2360-2371`) sends the definition's `#[activity(name = …)]` wire name and resolves to its result. The definition is the method's path, which never runs the impl in the workflow, so its dependencies stay on the worker. Never the deprecated `start_activity` (`:2376`).
- The input is `impl Into<AD::Input>`: several params pass as a tuple, `(card, amount)`, which converts into the `MultiArgsN` the macro declared (`common-wasm/src/data_converters.rs:843-848`).
- A failed activity is an `ActivityExecutionError`; `?` fails the run with it (`workflow/src/runtime/model.rs:262-266`). Let it propagate unless the `.twf` handles it.
- The options are the call's third argument ([options.md](./options.md)); calls sharing options share one function that returns them.
- The call starts when the future is made, not when it is awaited (`workflow_context.rs:604-611`): bound to a promise, it is `let p = ctx.execute_activity(…);` and `p.await?` is the `await` ([promise.md](./promise.md)).
- A `task_queue` with `{x}` parameters names one member of a worker family: set `task_queue` from the family's queue function with the workflow's inputs, and set `schedule_to_start_timeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
