# worker

```twf
@sdk(erlang, "erlang/orders_workers.erl")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```erlang
%% erlang/orders_workers.erl
-module(orders_workers).
-moduledoc "Each .twf worker's types and start, shared by the worker process and the tests.".

-export([
    order_types_workflows/0,
    order_types_activities/0,
    start_order_types/0,
    start_order_types/1
]).

-define(CLUSTER, cluster_1).

order_types_workflows() -> #{~"ProcessOrder" => orders_process_order}.

order_types_activities() ->
    #{~"ValidateOrder" => orders_validate_order, ~"ChargePayment" => orders_charge_payment}.

start_order_types() -> start_order_types(~"orders").

start_order_types(TaskQueue) ->
    {ok, _} = start(workflow, TaskQueue, order_types_workflows(), []),
    {ok, _} = start(activity, TaskQueue, order_types_activities(), []).

start(Type, TaskQueue, Names, Opts) ->
    temporal_sdk_worker:start(?CLUSTER, Type, [
        {namespace, ~"default"},
        {task_queue, TaskQueue},
        {temporal_name_to_erlang, fun(_Cluster, Name) ->
            case maps:find(unicode:characters_to_binary(Name), Names) of
                {ok, Module} -> {ok, Module};
                error -> {error, {"not a .twf name of this worker", #{name => Name}}}
            end
        end},
        {allowed_temporal_names, maps:keys(Names)}
        | Opts
    ]).
```

## Registration

- **The mechanics are author-elixir's** ([worker.md § Registration](../../temporal-architect-author-elixir/reference/worker.md#registration)): no per-type registration, so each `.twf` worker is two name→module maps in `<design>_workers.erl`, and `start_<worker>(TaskQueue)` starts a workflow and an activity worker with `temporal_sdk_worker:start(Cluster, workflow | activity, Opts)` (`worker/temporal_sdk_worker.erl:444-454`), passing a fun over the map as `temporal_name_to_erlang` and its keys as `allowed_temporal_names` (`:39-41,186-196`).
- **Prefix every module with its design.** Every module of a rebar3 app is global, so the worker module is `orders_workers` in `orders_workers.erl`, and its `@sdk(erlang, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory.
- **Erlang has no default arguments**, so `start_<worker>/0` passes the `.twf` task queue to `start_<worker>/1`, which the tests call with their own.
- The fun gets the name as chardata, a binary or a charlist (`worker/temporal_sdk_worker.erl:192-195`), so it normalizes with `unicode:characters_to_binary/1` before the lookup.

## Starting the SDK

The SDK reads its `clusters` environment when its application starts, and a cluster cannot be added later (`node/temporal_sdk_node_sup.erl:22-23`, `docs/cluster/-module.md:9,43`), so a process sets it first, then starts the application, then each worker:

```erlang
ok = application:set_env(temporal_sdk, clusters, [
    {cluster_1, [
        {client, #{adapter => {temporal_sdk_grpc_adapter_gun_pool, [{endpoints, [{{127, 0, 0, 1}, 7233}]}]}}}
    ]}
]),
{ok, _} = application:ensure_all_started(temporal_sdk),
{ok, _} = orders_workers:start_order_types().
```

`rebar3 ct` starts no application itself, so a suite's `init_per_suite` runs these steps.

**Or list the workers in `sys.config`**: a cluster's `{workflows, [Opts]}` and `{activities, [Opts]}` take the same option lists and start the workers with the application (`docs/cluster/-module.md:25-29`; `temporal_sdk_samples`' `config/dev.sys.config`). A config file holds no closure, so the mapping is an exported function named as an external fun, `{temporal_name_to_erlang, fun orders_workers:order_types_workflow/2}`, which `file:consult/1` reads, with `allowed_temporal_names` written out as binaries, `<<"ProcessOrder">>`. Keep the maps in `<design>_workers.erl` either way, and start at runtime wherever the queue varies, as in tests.

Connecting, running and shutting down: [author-elixir idioms.md § worker setup](../../temporal-architect-author-elixir/reference/idioms.md#worker-setup).

**Nexus.** Unsupported ([author-elixir nexus-service-def.md](../../temporal-architect-author-elixir/reference/nexus-service-def.md)): `start_<worker>` starts no `nexus` worker.

## Coverage

As [author-elixir § Coverage](../../temporal-architect-author-elixir/reference/worker.md#coverage): every worker on a task queue serves the identical type set, and a clean `twf check` is the design-time analog of full maps in `<design>_workers.erl`.

## Per-instance worker families

A `{param}` in a worker's `task_queue` is a family, one worker per instance, with the rules in [author-elixir § Per-instance worker families](../../temporal-architect-author-elixir/reference/worker.md#per-instance-worker-families):

```erlang
%% aivearium_workers.erl: one queue function per family, shared by the instance process and every caller.
sandbox_queue(SandboxId) -> <<"sandbox-", SandboxId/binary>>.

%% Called in the sidecar process, once per instance; start/4 as above, with namespace "aivearium".
start_sidecar(SandboxId) ->
    start(activity, sandbox_queue(SandboxId), sidecar_activities(), [
        {worker_id, <<"sidecar-", SandboxId/binary>>},
        {task_poller_pool_size, 2}
    ]).

%% In Agent:
#{~"call" := Call} = Task,
#{~"sandboxId" := SandboxId} = Lease,
case start_activity(~"RunTool", [Call], [
    {task_queue, aivearium_workers:sandbox_queue(SandboxId)},
    {schedule_to_start_timeout, {30, second}},
    {start_to_close_timeout, {5, minute}},
    wait
]) of
    #{state := completed, result := [Output]} -> complete_workflow_execution([Output]);
    %% timedout here may be the instance gone: reroute, or rerun the sequence.
    #{state := State} -> fail_workflow_execution(#{message => "RunTool " ++ atom_to_list(State)})
end
```

## Worker options

The namespace worker's `options:` map in [options.md](./options.md#worker-options), several to **none**.
