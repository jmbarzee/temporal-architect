# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Rust that is: await the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow Archive(items)
```

```rust
let detached = ChildWorkflowOptions::builder()
    .task_queue(ctx.task_queue().to_string())
    .parent_close_policy(ParentClosePolicy::Abandon)
    .cancel_type(ChildWorkflowCancellationType::Abandon)
    .build();
// Resolves once the child has started; a failed start fails the caller here.
ctx.start_child_workflow(Archive::run, items, detached).await?;
// Never `.result()`: it waits for completion.
```

- The child's options set `ParentClosePolicy::Abandon`, so the parent's close does nothing to the child, and `cancel_type: ChildWorkflowCancellationType::Abandon`, so the parent's cancellation is never requested of it (`workflow/src/workflow_context/options.rs:84-99,131-144,494-501`); the defaults are `Unspecified` (the server's terminate) and `WaitCancellationCompleted`. Neither is behind `experimental`. The task queue is set as for any child ([workflow-call.md](./workflow-call.md)).
- `ctx.start_child_workflow(...).await?` resolves at the child's start, and a failed start fails the caller (`workflow/src/workflow_context.rs:2418-2431`). Dropping the `StartedChildWorkflow` it returns leaves the child alone; only `.result()` waits for it (`:3494-3512`).
- A client start, `detach workflow` in a sync Nexus body, is unsupported in Rust ([nexus-service-def.md](./nexus-service-def.md)).

```twf
detach nexus GreeterEndpoint GreeterService.Greet(friend)
```

```rust
// Preview: the Nexus caller needs temporalio-sdk's `experimental` feature.
let options = NexusOperationOptions::builder()
    .endpoint("GreeterEndpoint")
    .service("GreeterService")
    .operation("Greet")
    .input(RawValue::from_value(&friend, ctx.payload_converter()).payloads.remove(0))
    .cancellation_type(NexusOperationCancellationType::Abandon)
    .build();
// Resolves once the operation starts; a sync operation starts by completing.
ctx.start_nexus_operation(options)
    .await
    .map_err(|f| ApplicationFailure::new(f.message))?;
// Never `.result()`: that waits for the result.
```

- Nexus has no parent-close policy. `cancellation_type: Some(NexusOperationCancellationType::Abandon)` keeps the caller's cancellation from reaching the operation; unset, it is `WaitCancellationCompleted` (`workflow/src/workflow_context/options/nexus.rs:12-27,87-88,124-127`). The type and the caller exist only with the `experimental` feature (`options.rs:39-45`), so `detach nexus` is preview in Rust.
- `ctx.start_nexus_operation(options)` resolves when the operation starts, or for a sync operation when it completes, to `Result<StartedNexusOperation, Failure>`, and its start failure is the `Err` (`workflow/src/runtime/model/nexus.rs:4,16-33`). The call is built as in [nexus.md](./nexus.md).
- When the operation finishes after the caller has closed, its completion callback to the caller fails and is dropped; that is server behavior, with no SDK surface to cite.
