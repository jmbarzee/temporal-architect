-module(continue_as_new_workers).
-moduledoc """
Each .twf worker's types and start, shared by the worker process and the tests. The tests run in
the dev server's only namespace, "default", not the design's `counters`.
""".

-export([
    counter_types_workflows/0,
    counter_types_activities/0,
    start_counter_types/0,
    start_counter_types/1
]).

-define(CLUSTER, cluster_1).

counter_types_workflows() -> #{~"Counter" => continue_as_new_counter}.

counter_types_activities() -> #{~"Increment" => continue_as_new_increment}.

start_counter_types() -> start_counter_types(~"counters").

start_counter_types(TaskQueue) ->
    {ok, _} = start(workflow, TaskQueue, counter_types_workflows(), []),
    {ok, _} = start(activity, TaskQueue, counter_types_activities(), []).

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
