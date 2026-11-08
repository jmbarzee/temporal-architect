# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```java
// ProcessOrder.java
@WorkflowInterface
public interface ProcessOrder {
  @WorkflowMethod
  Result run(Order order);
}

// ProcessOrderImpl.java
public class ProcessOrderImpl implements ProcessOrder {
  @Override
  public Result run(Order order) {
    return new Result("done");
  }
}
```

A `@WorkflowInterface` interface named as the `.twf` names it, with one `@WorkflowMethod` (its method name is free; `run`) and `name` unset ([SKILL.md](../SKILL.md#wire-names)), implemented by an impl class. Params are positional, one payload each; no DSL return type → `void`; `-> (A, B)` → one record ([types.md](./types.md)). Workflow state is the impl's fields, and a constructor that needs the run's params is `@WorkflowInit` (`temporal-developer` `references/java/java.md` § Workflow Definition, `advanced-features.md` § Workflow Init Annotation).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```java
@WorkflowInterface
public interface ShipItem {
  @WorkflowMethod
  Shipment run(Order order, Item item);

  static String id(String orderId, String itemId) {
    return "ship-" + orderId + "-" + itemId;
  }
}
```

One static ID method per scheme, on the workflow's interface, taking one argument per hole; the SDK skips static methods there (`common/metadata/POJOWorkflowInterfaceMetadata.java:402-408`). Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline. A `@Service` interface is the exception: every method there must be an `@Operation`, statics included (`nexus-sdk` `ServiceDefinition.java:50-55`, `OperationDefinition.java:13-24`), so a helper a handler needs lives on the handler class or the workflow's interface.

A type that has a scheme or ID policies, or backs a Nexus run operation, also gets one static start-options method holding its ID, task queue and `default_options:`; every client start uses it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```java
// On OrderTracker:
static WorkflowOptions startOptions(String orderId) {
  return WorkflowOptions.newBuilder()
      .setWorkflowId(id(orderId))
      .setTaskQueue(Workers.FULFILLMENT_TASK_QUEUE)
      .setWorkflowIdConflictPolicy(WorkflowIdConflictPolicy.WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING)
      .build();
}

WorkflowClient.start(client.newWorkflowStub(OrderTracker.class, OrderTracker.startOptions(orderId))::run, orderId);
```

`WorkflowOptions` is the client's (`client/WorkflowOptions.java:157-272`); the run's args travel in the `WorkflowClient.start` call (`client/WorkflowClient.java:408`).

## Determinism constraints

`temporal-developer` `references/java/determinism.md` § Forbidden Operations in Workflows, § Safe Builtin Alternatives, and `determinism-protection.md`; changing running workflows: `references/java/versioning.md`.
