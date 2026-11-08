# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```rust
let ship_result = ctx
    .start_child_workflow(ShipOrder::run, order, child_options(ctx))
    .await?
    .result()
    .await?;

/// Every child names its task queue: here, the caller's.
fn child_options<W>(ctx: &WorkflowContext<W>) -> ChildWorkflowOptions {
    ChildWorkflowOptions::builder()
        .task_queue(ctx.task_queue().to_string())
        .build()
}
```

- `ctx.start_child_workflow(W::run, input, options)` (`workflow/src/workflow_context.rs:2418-2431`) resolves once the child starts, to a `StartedChildWorkflow`; its `.result()` resolves to the child's output (`:3494-3512`). A failed start is a `ChildWorkflowStartError` and a failed child a `ChildWorkflowExecutionError`; `?` fails the caller with either (`workflow/src/runtime/model.rs:268-290`).
- **Always set `task_queue`.** An activity's unset queue becomes the workflow's (`workflow_context.rs:1192-1194`), but a child's is sent as `""` (`workflow/src/workflow_context/options.rs:490-493,564`), which the time-skipping test server never starts (#519). With no `task_queue` in the `.twf`, set the caller's, `ctx.task_queue()`.
- A qualified callee, `workflow orders.ShipOrder(...)`, is `ShipOrder` from the crate for the `.twf` package `orders`, one crate per package; the wire name stays `ShipOrder`.
- A child with an `id_scheme:` sets `.workflow_id(ShipItem::id(&order.id, &item.id))` from its ID function ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave it unset and the parent generates a deterministic UUIDv4 (`options.rs:488`).
- A child takes `id_reuse_policy` only; it has no conflict policy, so a start onto a running ID fails ([options.md](./options.md#workflow-id-policies)). A `workflow` start in a sync Nexus body is a client start, unsupported in Rust ([nexus-service-def.md](./nexus-service-def.md)).
- The `StartedChildWorkflow` is the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)); `.result()` consumes it, so sends come first. As a promise: [promise.md](./promise.md). Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Unset, `parent_close_policy` is `ParentClosePolicy::Unspecified`, the server's default, terminate (`options.rs:131-137`) — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md#child-workflow-options)) when the child should outlive the parent.
