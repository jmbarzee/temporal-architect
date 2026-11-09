# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```elixir
# orders/process_order.ex
defmodule Orders.ProcessOrder do
  use TemporalSdk.Workflow

  @impl true
  def execute(_context, [order]) do
    complete_workflow_execution([%{"status" => "done"}])
  end
end
```

A module per workflow, `use TemporalSdk.Workflow` (`@behaviour :temporal_sdk_workflow`, `lib/temporal_sdk/temporal_sdk_workflow.ex:5-11`), with one `execute(context, input)` callback (`temporal_sdk/temporal_sdk_workflow.erl:1581-1582`). Its type name is the `.twf` name, mapped to the module by the worker ([SKILL.md](../SKILL.md#wire-names)). `input` is the list of decoded payloads, so the params are positional, one payload each: `[order]`, `[a, b]`. `execute/2`'s return value is ignored: the run's result is what it closes with ([close.md](./close.md)); `-> (A, B)` → one map ([types.md](./types.md)). Workflow state is the main execution's own: its variables, or the process dictionary for what a later step reads ([condition.md](./condition.md)).

`context` carries what calls need: the worker's task queue, `context.worker_opts.task_queue`, and the run's workflow ID, `context.task.workflow_execution.workflow_id` (`temporal_sdk/temporal_sdk_workflow.erl:1530-1543`); both are set on every task, while `context.workflow_info` is partial on a task polled from a sticky queue (`:1565-1566`, `executor/temporal_sdk_executor_workflow.erl:2810-2819`).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```elixir
defmodule Orders.ShipItem do
  use TemporalSdk.Workflow

  def id(order_id, item_id), do: "ship-#{order_id}-#{item_id}"

  @impl true
  def execute(_context, [order, item]), do: ...
end
```

One public ID function per scheme, on the workflow's module, taking one argument per hole; its value is the full workflow ID. Every start ([workflow-call.md](./workflow-call.md)) and every client start calls it; never format the ID inline.

A type that has a scheme or ID policies also gets one start-options function holding its ID, task queue and `default_options:`; every client start uses it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```elixir
# On Orders.OrderTracker:
def start_options(order_id) do
  [
    input: [order_id],
    workflow_id: id(order_id),
    workflow_id_conflict_policy: :WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING
  ]
end

TemporalSdk.start_workflow(:cluster_1, "fulfillment", "OrderTracker", Orders.OrderTracker.start_options(order_id))
```

`TemporalSdk.start_workflow/4` (`temporal_sdk/temporal_sdk.erl:219-259,566-568`) takes the task queue and the `.twf` name as strings, and the run's args as `input:`. Without `workflow_id:` it generates `"<Type>/<uuid>"`, and without `namespace:` it starts in `"default"` (`:571-573`).

## Determinism constraints

[idioms.md § determinism](./idioms.md#determinism); changing running workflows: [idioms.md § versioning](./idioms.md#versioning).
