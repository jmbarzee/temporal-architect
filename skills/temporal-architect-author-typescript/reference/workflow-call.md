# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```ts
const shipResult = await executeChild(ShipOrder, { args: [order] });
```

- Pass the function, imported from its workflows module, never a string; options sit beside `args` ([options.md](./options.md#child-workflow-options)). A failed child rejects the `await`.
- A qualified callee, `workflow orders.ShipOrder(...)`, is `ShipOrder` imported from the module generated for the `.twf` package `orders`, one directory per package.
- A child with an `id_scheme:` gets `workflowId: shipItemId(order.id, item.id)` from its ID function ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave `workflowId` unset and the SDK generates one.
- A child takes `workflowIdReusePolicy` only; it has no conflict policy, so a start onto a running ID rejects ([options.md](./options.md#workflow-id-policies)). A `workflow` start in a sync nexus body is a client start instead: `getClient().workflow.start` with the type's start options ([nexus-service-def.md](./nexus-service-def.md#sync)).
- Bound to a promise, the call is `startChild(...)`, whose `ChildWorkflowHandle` resolves once the child has started and is also the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)); `await handle.result()` is the `await`. Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Default `parentClosePolicy` is `TERMINATE` — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md)) when the child should outlive the parent.
