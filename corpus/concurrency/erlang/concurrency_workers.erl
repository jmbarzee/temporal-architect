-module(concurrency_workers).
-moduledoc """
Each .twf worker's types and start, shared by the worker process and the tests. The tests run in
the dev server's only namespace, "default", not the design's `batches`.
""".

-export([
    batch_types_workflows/0,
    batch_types_activities/0,
    start_batch_types/0,
    start_batch_types/1
]).

-define(CLUSTER, cluster_1).

batch_types_workflows() ->
    #{
        ~"Batch" => concurrency_batch,
        ~"Audit" => concurrency_audit,
        ~"Archive" => concurrency_archive
    }.

batch_types_activities() -> #{~"Count" => concurrency_count, ~"Store" => concurrency_store}.

start_batch_types() -> start_batch_types(~"batches").

start_batch_types(TaskQueue) ->
    {ok, _} = start(workflow, TaskQueue, batch_types_workflows(), []),
    {ok, _} = start(activity, TaskQueue, batch_types_activities(), []).

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
