# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```erlang
%% orders_process_order.erl
-module(orders_process_order).

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [_Order]) ->
    complete_workflow_execution([#{~"status" => ~"done"}]).
```

A module per workflow, named for its design, including `workflow.hrl`, which declares `-behaviour(temporal_sdk_workflow)` and imports the workflow API unqualified (`include/workflow.hrl:1,6-123`), with one exported `execute(Context, Input)` (`temporal_sdk/temporal_sdk_workflow.erl:1581-1582`). The mechanics are [author-elixir's workflow-def.md](../../temporal-architect-author-elixir/reference/workflow-def.md): the type name is the `.twf` name, mapped by the worker ([SKILL.md](../SKILL.md#wire-names)); `Input` is the positional payload list, `[Order]`, `[A, B]`; `execute/2`'s return value is ignored, so the run's result is what it closes with ([close.md](./close.md)). `rebar.config`'s `warnings_as_errors` rejects an unused variable, so a param the body ignores is `_Order`.

What calls need comes out of `Context`, a map, matched once at the top (`temporal_sdk/temporal_sdk_workflow.erl:1530-1543`):

```erlang
#{
    worker_opts := #{task_queue := TaskQueue},
    task := #{workflow_execution := #{workflow_id := Wid}}
} = Context,
```

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```erlang
-module(orders_ship_item).

-export([execute/2, id/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

id(OrderId, ItemId) -> <<"ship-", OrderId/binary, "-", ItemId/binary>>.

execute(_Context, [Order, Item]) -> ...
```

One exported ID function per scheme, on the workflow's module, taking one binary per hole; its value is the full workflow ID. Every start ([workflow-call.md](./workflow-call.md)) and every client start calls it; never build the ID inline.

A type that has a scheme or ID policies also gets one start-options function holding its ID, task queue and `default_options:`; every client start uses it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```erlang
%% On orders_order_tracker:
start_options(OrderId) ->
    [
        {input, [OrderId]},
        {workflow_id, id(OrderId)},
        {workflow_id_conflict_policy, 'WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING'}
    ].

temporal_sdk:start_workflow(
    cluster_1, ~"fulfillment", ~"OrderTracker", orders_order_tracker:start_options(OrderId)
)
```

`temporal_sdk:start_workflow/4` takes the task queue and the `.twf` name as binaries, and the run's args as `input` ([author-elixir § `id_scheme:`](../../temporal-architect-author-elixir/reference/workflow-def.md#id_scheme) for its defaults).

## Determinism constraints

[author-elixir idioms.md § determinism](../../temporal-architect-author-elixir/reference/idioms.md#determinism); changing running workflows: [§ versioning](../../temporal-architect-author-elixir/reference/idioms.md#versioning).
