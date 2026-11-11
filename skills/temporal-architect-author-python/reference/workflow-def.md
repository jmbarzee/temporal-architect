# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```python
@workflow.defn
class ProcessOrder:
    @workflow.run
    async def run(self, order: Order) -> Result:
        return Result(status="done")
```

A `@workflow.defn` class in the worker's workflows module, named as the `.twf` names it ([SKILL.md](../SKILL.md#wire-names)), with one `@workflow.run async def run`. Params are positional, one payload each; no DSL return type → `-> None`; `-> (A, B)` → `-> tuple[A, B]`, one payload. Workflow state lives in `__init__`, since handlers can run before `run`. When a handler reads a workflow param, decorate `__init__` with `@workflow.init` so it takes `run`'s params too (`temporalio/workflow/_definition.py:104-121`).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```python
def ship_item_id(order_id: str, item_id: str) -> str:
    return f"ship-{order_id}-{item_id}"
```

One ID function per scheme, taking one argument per hole, in a shared module (the corpus's `api.py`) that workflows import under `workflow.unsafe.imports_passed_through()`. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

A type with ID policies or other `default_options:` also gets one start-options function holding its ID and those defaults; every client start unpacks it ([options.md](./options.md#workflow-id-policies)). A type with only a scheme passes `id=` from its ID function.

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```python
class StartOptions(TypedDict, total=False):
    id: Required[str]
    id_reuse_policy: WorkflowIDReusePolicy
    id_conflict_policy: WorkflowIDConflictPolicy


def order_tracker_start_options(order_id: str) -> StartOptions:
    return {"id": order_tracker_id(order_id), "id_conflict_policy": WorkflowIDConflictPolicy.USE_EXISTING}


await client.start_workflow(
    OrderTracker.run, order_id, task_queue=FULFILLMENT_TASK_QUEUE, **order_tracker_start_options(order_id)
)
```

`StartOptions` holds the keyword arguments `Client.start_workflow` and `WorkflowRunOperationContext.start_workflow` share (`temporalio/client/_client.py:435`, `temporalio/nexus/_operation_context.py:473`); add a key when a type's `default_options:` sets it.

## Determinism constraints

`temporal-developer` `references/python/determinism.md` and `determinism-protection.md` (the sandbox, `imports_passed_through`); changing running workflows: `references/python/versioning.md`.
