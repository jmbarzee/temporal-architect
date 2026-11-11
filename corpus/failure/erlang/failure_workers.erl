-module(failure_workers).
-moduledoc """
Each .twf worker's types and start, shared by the worker process and the tests. The tests run in
the dev server's only namespace, "default", not the design's `jobs`.
""".

-export([
    job_types_workflows/0,
    job_types_activities/0,
    start_job_types/0,
    start_job_types/1
]).

-define(CLUSTER, cluster_1).

job_types_workflows() -> #{~"Job" => failure_job}.

job_types_activities() -> #{~"Reject" => failure_reject, ~"Process" => failure_process}.

start_job_types() -> start_job_types(~"jobs").

start_job_types(TaskQueue) ->
    {ok, _} = start(workflow, TaskQueue, job_types_workflows(), []),
    {ok, _} = start(activity, TaskQueue, job_types_activities(), []).

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
