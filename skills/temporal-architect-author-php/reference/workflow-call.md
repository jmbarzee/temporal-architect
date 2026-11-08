# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```php
$shipResult = yield Workflow::newChildWorkflowStub(ShipOrder::class)->run($order);
```

- `Workflow::newChildWorkflowStub(Class::class, $options)` (`Workflow.php:811`) returns a proxy whose `#[WorkflowMethod]` call starts the child and returns a promise of its result (`Internal/Workflow/ChildWorkflowProxy.php:59-85`), so the wire name comes from the class, never a string. Options are the optional second argument ([options.md](./options.md#child-workflow-options)). A failed child throws `ChildWorkflowFailure` (`Exception/Failure/ChildWorkflowFailure.php:16`) from the `yield`.
- A qualified callee, `workflow orders.ShipOrder(...)`, is `ShipOrder` from the namespace generated for the `.twf` package `orders`, one namespace per package.
- A start's ID comes only from the callee's `id_scheme:` (an `id:` under a start is `ID_AT_START`). A child with one gets `withWorkflowId(Shipping::shipItemId($order->id, $item->id))` from its ID function ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave it unset and the SDK generates one (`Internal/Workflow/ChildWorkflowStub.php:72-74`).
- A child takes `withWorkflowIdReusePolicy` only; it has no conflict policy ([options.md](./options.md#workflow-id-policies)).
- Bound to a promise, keep the proxy and the promise its call returns: the proxy is the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)), and `yield` on the promise is the `await`. Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Default parent-close policy is `Terminate` (`Workflow/ChildWorkflowOptions.php:139`) — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md)) when the child should outlive the parent.
