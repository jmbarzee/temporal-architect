# options

Every key, unit, default and **none** row is [author-elixir's options.md](../../temporal-architect-author-elixir/reference/options.md)'s, spelled for Erlang:

- **Call options are a proplist**, the call's last argument: `{start_to_close_timeout, {2, minute}}`, with a bare atom for `{Atom, true}`, as in `wait` (`temporal_sdk/temporal_sdk_workflow.erl:165-207`).
- **Nested structures are maps with atom keys**: `retry_policy` (`temporal_sdk/temporal_sdk.erl:138-144`), whose two intervals take integer milliseconds only (`api/temporal_sdk_api_common.erl:22-37`), and `priority`, the raw proto map `#{priority_key => 1, fairness_key => ~"tenant-a", fairness_weight => 1.0}`.
- **Enums are quoted uppercase atoms**, the proto enum names: `'PARENT_CLOSE_POLICY_ABANDON'`. Unquoted, an uppercase name is a variable.
- A duration is integer milliseconds or `{N, Unit}`, with `millisecond` to `day` (`temporal_sdk/temporal_sdk.erl:130-135`).
- **A key appears once.** Each option is taken out of the list once, and a leftover duplicate fails the call as `invalid_opts` (`utils/temporal_sdk_utils_lists.erl:28-32`, `utils/temporal_sdk_utils_opts.erl:131-132`), so never append an override to a list that holds the key.

Calls sharing options share one function.

## Activity options

```twf
activity UnreliableService(data) -> result
	options:
		start_to_close_timeout: 2m
		retry_policy:
			maximum_attempts: 5
			initial_interval: 1s
			backoff_coefficient: 2.0
			maximum_interval: 60s
```

```erlang
start_activity(~"UnreliableService", [Data], [
    {start_to_close_timeout, {2, minute}},
    {retry_policy, #{
        maximum_attempts => 5,
        initial_interval => 1_000,
        backoff_coefficient => 2.0,
        maximum_interval => 60_000
    }},
    wait
])
```

The `.twf` keys and the SDK's defaults: [author-elixir § Activity options](../../temporal-architect-author-elixir/reference/options.md#activity-options).

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```erlang
#{~"data" := Data} = Input,
start_child_workflow(TaskQueue, ~"ChildWorkflow", [
    {input, [Data]},
    {workflow_id, <<Wid/binary, "/ChildWorkflow">>},
    {workflow_execution_timeout, {1, hour}},
    {parent_close_policy, 'PARENT_CLOSE_POLICY_REQUEST_CANCEL'},
    {retry_policy, #{maximum_attempts => 3}},
    wait
])
```

`TaskQueue` and `Wid` come from the caller's context ([workflow-def.md](./workflow-def.md)). The task queue is positional, `workflow_id` is always passed, `namespace` defaults to `"default"`, and the keys: [author-elixir § Child workflow options](../../temporal-architect-author-elixir/reference/options.md#child-workflow-options).

## Nexus operation options

Unsupported: [author-elixir § Nexus operation options](../../temporal-architect-author-elixir/reference/options.md#nexus-operation-options).

## Definition-level `default_options:`

```twf
activity ChargeCard(card, amount) -> receipt
	default_options:
		start_to_close_timeout: 30s
		retry_policy:
			maximum_attempts: 5
```

One function on the definition's module returns the defaults as a map, and every call starts from it. A call with its own `options:` merges them in with `maps:merge/2`, which replaces each key whole, a nested map included, and passes the result as a list:

```erlang
%% payments_charge_card.erl
-export([execute/2, defaults/0]).

defaults() -> #{start_to_close_timeout => {30, second}, retry_policy => #{maximum_attempts => 5}}.

%% In the workflow:
start_activity(~"ChargeCard", [Card, Amount], [wait | maps:to_list(payments_charge_card:defaults())]),

start_activity(~"ChargeCard", [Card, Tip], [
    wait
    | maps:to_list(
        maps:merge(payments_charge_card:defaults(), #{retry_policy => #{maximum_attempts => 1}})
    )
])
```

Never merge the override into the default's `retry_policy` map: that merges field by field. The rule itself: [author-elixir § Definition-level `default_options:`](../../temporal-architect-author-elixir/reference/options.md#definition-level-default_options).

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`{workflow_id_reuse_policy, 'WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE'}` and `{workflow_id_conflict_policy, 'WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING'}`. A client start, `temporal_sdk:start_workflow/4`, takes both, from the type's start-options function ([workflow-def.md](./workflow-def.md#id_scheme)); a child start takes the reuse policy only ([author-elixir § Workflow ID policies](../../temporal-architect-author-elixir/reference/options.md#workflow-id-policies)).

## Worker options

A namespace worker's `options:` map onto `temporal_sdk_worker:start/3`'s options, which take a proplist or a map (`worker/temporal_sdk_worker.erl:32-72,444-454`), row for row as [author-elixir § Worker options](../../temporal-architect-author-elixir/reference/options.md#worker-options), several to **none**. Its nested settings are a map for `limits` and proplists for `task_settings`: `{limits, #{worker => #{workflow => {Concurrency, Frequency}}}}`, `{task_settings, [{sticky_execution, [{type, pool}, {schedule_to_start_timeout, T}]}]}` (`worker/temporal_sdk_worker_opts.erl:269-297`).

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
```

```erlang
%% orders_workers.erl, with start/4 from worker.md (namespace "orders"):
start_order_types(TaskQueue) ->
    {ok, _} = start(workflow, TaskQueue, order_types_workflows(), []),
    {ok, _} = start(activity, TaskQueue, order_types_activities(), [
        {limits, #{worker => #{activity_regular => {50, 1_000_000}}}}
    ]).
```

## Timeouts and retries

The SDK's hexdocs at the pin: [author-elixir idioms.md § errors](../../temporal-architect-author-elixir/reference/idioms.md#errors).
