# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`.await` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```rust
let handle_a = ctx.execute_activity(ItemActivities::process_a, items.a.clone(), activity_options());
// ... do other work ...
let result_a = handle_a.await?;
```

| `promise p <- …` | Rust |
|------------------|------|
| `activity` | `ctx.execute_activity(XActivities::method, arg, opts)` |
| `workflow` | `ctx.start_child_workflow(W::run, arg, opts)`; await it, then `.result()` (`crates/workflow/src/workflow_context.rs:3496`) |
| `timer(5m)` | `ctx.timer(Duration::from_secs(300))` |
| `nexus …` | `ctx.start_nexus_operation(opts)` ([nexus.md](./nexus.md)) |
| `signal Approve` / `update Review` | `take(ctx, of!(approves))` |

- Each SDK call issues its command when called, not when awaited: the context polls the new future once for construction (`crates/workflow/src/workflow_context.rs:604-611`; timer `:1141`, activity `:1233`, child `:1445`; Nexus `crates/workflow/src/workflow_context/nexus.rs:62`). Never wrap the call in `async { … }` to bind it: an async block runs only when polled, so the call would start at the await.
- A promise on a signal or update begins waiting at its binding: `take` joins the message's `Arrivals` line when called, and the bound wait is an unawaited `take` ([await-signal.md](./await-signal.md)), as the corpus's `let approval = take(ctx, of!(approves));` and its `a_promise_begins_waiting_at_its_binding` show.
- In `await one:`, a promise is a case by name: `select!` borrows it, so it must be `Unpin` and fused. SDK futures are both; pin and fuse a `take` at its binding, `let mut p = pin!(take(ctx, of!(xs)).fuse());`. Losing a round never cancels it, a `timer` promise included: it is only borrowed, and stays awaitable (spec 06; the corpus's `BoundDeadline`).
