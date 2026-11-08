# close

| DSL | Rust |
|-----|------|
| `close complete(Receipt{status: "done"})` | `return Ok(Receipt { status: "done".into() });` |
| `close complete` (no return type) | `return Ok(());` |
| `close fail(OrderResult{status: "cancelled"})` | `return Err(ApplicationFailure::builder("order cancelled").type_name("OrderCancelled".to_owned()).details(OrderResult { status: "cancelled".into() }).build().into());` |
| `close continue_as_new(next, limit)` | `match ctx.continue_as_new(MultiArgs2(next, limit), ContinueAsNewOptions::default())? {}` — same workflow, new input |

- `ApplicationFailure` (`common-wasm/src/error.rs:247-286`) is `::new(message)`, or `::builder(message)` with `type_name`, `non_retryable` and `details`. Returned as the run's `Err`, it fails the run, and so does any SDK error `?` propagates (`workflow/src/runtime/model.rs:190-290`).
- `ctx.continue_as_new(input, options)` (`workflow/src/workflow_context.rs:2523-2536`) only ever returns `Err`, the termination to propagate; its `Ok` is `Infallible`, so `match …? {}` ends the arm. The input is the run's input type, `MultiArgsN` for several params, and unset options keep the run's type and task queue (`workflow/src/workflow_context/options.rs:713-722`). It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Retryable vs non-retryable errors: [idioms.md § Errors](./idioms.md#errors).
