# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```ruby
ship_result = ShipResult.from_h(Temporalio::Workflow.execute_child_workflow(ShipOrder, order))
```

- `Workflow.execute_child_workflow(workflow, *args, **options)` (`workflow.rb:199-229`) is `start_child_workflow` then the handle's `result`: it starts the child and blocks until its result. Pass the class, so the wire name is the class's; options are the call's keywords ([options.md](./options.md#child-workflow-options)). A failed child raises `Temporalio::Error::ChildWorkflowError` (`error/failure.rb:235`) from the call.
- `Workflow.start_child_workflow` (`workflow.rb:444-474`) returns a `ChildWorkflowHandle` once the child has started, and a failed start raises from it (`internal/worker/workflow_instance/outbound_implementation.rb:395-434`). Keep the handle when the child is signaled ([signal-send.md](./signal-send.md)); `handle.result` waits for its result (`workflow/child_workflow_handle.rb:35`).
- A qualified callee, `workflow orders.ShipOrder(...)`, is `Orders::ShipOrder`, loaded with `require_relative` from the package's directory; the module never changes the wire name ([SKILL.md](../SKILL.md#wire-names)).
- A child with an `id_scheme:` passes `id: ShipItem.workflow_id(order.id, item.id)` from its ID method ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave `id:` unset and the SDK uses `Workflow.random.uuid` (`workflow.rb:447`).
- A child takes `id_reuse_policy:` only; it has no conflict policy, so a start onto a running ID fails ([options.md](./options.md#workflow-id-policies)).
- Bound to a promise, the start runs in a `Temporalio::Workflow::Future`, and `future.wait` is the `await` ([promise.md](./promise.md)). Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Unset, `parent_close_policy:` is `TERMINATE` (`workflow.rb:453`) — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md)) when the child should outlive the parent.
