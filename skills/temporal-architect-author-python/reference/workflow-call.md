# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```python
ship_result = await workflow.execute_child_workflow(ShipOrder.run, order)
```

- Pass the `@workflow.run` method, imported from its workflows module, never a string; options are keyword arguments beside the input ([options.md](./options.md#child-workflow-options)), several inputs `args=[…]`. A failed child raises `ChildWorkflowError` at the `await`.
- A qualified callee, `workflow orders.ShipOrder(...)`, is `ShipOrder` imported from the module generated for the `.twf` package `orders`, one directory per package.
- A child with an `id_scheme:` gets `id=ship_item_id(order.id, item.id)` from its ID function ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave `id` unset and the SDK generates one (`temporalio/workflow/_workflow_ops.py:392`).
- A child takes `id_reuse_policy` only; it has no conflict policy, so a start onto a running ID raises ([options.md](./options.md#workflow-id-policies)). A `workflow` start in a sync nexus body is a client start instead: `nexus.client().start_workflow` with the type's start options ([nexus-service-def.md](./nexus-service-def.md#sync)).
- Bound to a promise, the call is `start_child_workflow(...)`, whose `ChildWorkflowHandle` returns once the child has started and is also the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)); `await handle` is the `await`. Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Default `parent_close_policy` is `TERMINATE` — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md)) when the child should outlive the parent.
