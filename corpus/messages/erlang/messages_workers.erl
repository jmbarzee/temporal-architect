-module(messages_workers).
-moduledoc """
Each .twf worker's types and start, shared by the worker process and the tests. The tests run in
the dev server's only namespace, "default", not the design's `approvals`.
""".

-export([approval_types_workflows/0, start_approval_types/0, start_approval_types/1]).

-define(CLUSTER, cluster_1).

approval_types_workflows() -> #{~"Approval" => messages_approval}.

start_approval_types() -> start_approval_types(~"approvals").

start_approval_types(TaskQueue) ->
    {ok, _} = start(workflow, TaskQueue, approval_types_workflows(), []).

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
