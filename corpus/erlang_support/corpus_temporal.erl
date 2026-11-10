-module(corpus_temporal).
-moduledoc "One SDK cluster against a dev server, and the test helpers each design shares.".

-export([
    cluster/0,
    start/0,
    start_worker/4,
    start_worker/5,
    stop_worker/2,
    start_workflow/4,
    start_workflow/5,
    signal/3,
    query/2,
    result/1,
    events/1,
    history/1,
    replay/2
]).

-define(CLUSTER, cluster_1).

cluster() -> ?CLUSTER.

-doc "Starts the SDK with one cluster pointing at TEMPORAL_ADDRESS (default 127.0.0.1:7233).".
start() ->
    case lists:keymember(temporal_sdk, 1, application:which_applications()) of
        true ->
            ok;
        false ->
            [Host, Port] = string:split(os:getenv("TEMPORAL_ADDRESS", "127.0.0.1:7233"), ":"),
            {ok, Ip} = inet:getaddr(Host, inet),
            Endpoints = [{Ip, list_to_integer(Port)}],
            ok = application:set_env(temporal_sdk, clusters, [
                {?CLUSTER, [
                    {client, #{
                        adapter => {temporal_sdk_grpc_adapter_gun_pool, [{endpoints, Endpoints}]}
                    }}
                ]}
            ]),
            {ok, _} = application:ensure_all_started(temporal_sdk),
            ok
    end.

-doc "Starts a test-only worker, such as a fixture's; `Names` maps each .twf name to its module.".
start_worker(Type, Id, TaskQueue, Names) -> start_worker(Type, Id, TaskQueue, Names, []).

start_worker(Type, Id, TaskQueue, Names, Opts) ->
    ToModule = fun(_Cluster, Name) ->
        case maps:find(unicode:characters_to_binary(Name), Names) of
            {ok, Mod} -> {ok, Mod};
            error -> {error, {"not registered", #{name => Name}}}
        end
    end,
    temporal_sdk_worker:start(?CLUSTER, Type, [
        {worker_id, Id},
        {task_queue, TaskQueue},
        {allowed_temporal_names, maps:keys(Names)},
        {temporal_name_to_erlang, ToModule}
        | Opts
    ]).

stop_worker(Type, Id) -> temporal_sdk_worker:terminate(?CLUSTER, Type, Id).

-doc """
Starts a workflow under a fresh ID, `<Type>-<Label>-<unique>`, and returns its execution. The
label names the history the run records (see `replay/2`). A run that sleeps passes
`{time_skipping_config, #{enabled => true}}` in `Opts`, since the dev server skips time per start.
""".
start_workflow(TaskQueue, Type, Label, Input) -> start_workflow(TaskQueue, Type, Label, Input, []).

start_workflow(TaskQueue, Type, Label, Input, Opts) ->
    Id = iolist_to_binary([
        Type, "-", Label, "-", integer_to_list(erlang:unique_integer([positive])), "-",
        integer_to_list(os:system_time(millisecond))
    ]),
    {ok, #{workflow_execution := WE}} = temporal_sdk:start_workflow(?CLUSTER, TaskQueue, Type, [
        {input, Input}, {workflow_id, Id}, {opentelemetry, false} | Opts
    ]),
    WE.

signal(WE, Name, Args) -> temporal_sdk:signal_workflow(?CLUSTER, WE, Name, [{input, Args}]).

query(WE, Name) -> temporal_sdk:query_workflow(?CLUSTER, WE, Name).

-doc "Awaits a workflow's result, following its continue-as-new chain to the last run.".
result(WE) ->
    case temporal_sdk:await_workflow(?CLUSTER, WE, [{timeout, {60, second}}]) of
        {ok, {completed, #{result := [R]}}} -> R;
        {ok, {continued_as_new, #{new_execution_run_id := Run}}} -> result(WE#{run_id => Run})
    end.

history(WE) ->
    {ok, H} = temporal_sdk:get_workflow_history(?CLUSTER, WE),
    H.

events(WE) -> [maps:get(event_type, E) || E <- history(WE)].

-doc """
Replays a recorded history (`temporal workflow show --output json`) against `Names`, which maps
the workflow type, the file name's prefix before `--`, to its module. The SDK's check compares
awaitables, never results, so a run that completed must replay to the result it recorded.
""".
replay(File, Names) ->
    [Type | _] = string:split(filename:basename(File), "--"),
    Replayed = temporal_sdk:replay_file(?CLUSTER, maps:get(list_to_binary(Type), Names), File),
    case recorded_result(File) of
        undefined -> Replayed;
        Result when Replayed =:= {ok, {completed, Result}} -> Replayed;
        Result -> {error, #{recorded => Result, replayed => Replayed}}
    end.

%% The recorded completion's payloads, decoded as the SDK's default converter encodes them.
recorded_result(File) ->
    {ok, Bin} = file:read_file(File),
    #{~"events" := Events} = json:decode(Bin),
    Completed = [
        R
     || #{~"workflowExecutionCompletedEventAttributes" := #{~"result" := R}} <- Events
    ],
    case Completed of
        [] -> undefined;
        [R | _] -> [decode(P) || P <- maps:get(~"payloads", R, [])]
    end.

decode(#{~"metadata" := #{~"encoding" := Encoding}, ~"data" := Data}) ->
    case base64:decode(Encoding) of
        ~"binary/plain" -> base64:decode(Data);
        ~"json/plain" -> json:decode(base64:decode(Data))
    end.
