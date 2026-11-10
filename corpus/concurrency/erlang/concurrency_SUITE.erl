-module(concurrency_SUITE).
-moduledoc """
Batch end to end, and `await one` first-listed-wins: on a tie (one workflow task holding both
the timer fire and Ack), in either history order, the case listed first wins. A tie that never
lands in its attempts is skipped, and its behaviour is never asserted.
""".

-include_lib("stdlib/include/assert.hrl").

-export([all/0, suite/0, init_per_suite/1, end_per_suite/1]).
-export([
    batch_acknowledged/1,
    batch_timed_out/1,
    tie_ack_listed_timer_fired_first/1,
    tie_ack_listed_signal_first/1,
    tie_timer_listed_timer_fired_first/1,
    tie_timer_listed_signal_first/1
]).

-define(TQ, ~"batches-test-erlang").
-define(FIRED, 'EVENT_TYPE_TIMER_FIRED').
-define(SIGNALED, 'EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED').

suite() -> [{timetrap, {minutes, 3}}].

all() ->
    [
        batch_acknowledged,
        batch_timed_out,
        tie_ack_listed_timer_fired_first,
        tie_ack_listed_signal_first,
        tie_timer_listed_timer_fired_first,
        tie_timer_listed_signal_first
    ].

init_per_suite(Config) ->
    ok = corpus_temporal:start(),
    %% The workflow and activity workers share the default worker ID, built from the queue.
    {ok, #{worker_id := Id}} = concurrency_workers:start_batch_types(?TQ),
    [{worker_id, Id} | Config].

end_per_suite(Config) ->
    Id = proplists:get_value(worker_id, Config),
    corpus_temporal:stop_worker(workflow, Id),
    corpus_temporal:stop_worker(activity, Id),
    ok.

batch_acknowledged(_Config) ->
    WE = corpus_temporal:start_workflow(?TQ, ~"Batch", ~"acknowledged", [[~"a", ~"b"]]),
    timer:sleep(1_500),
    corpus_temporal:signal(WE, ~"Ack", []),
    ?assertEqual(
        #{~"count" => 2, ~"audited" => true, ~"status" => ~"acknowledged"},
        corpus_temporal:result(WE)
    ),
    ?assert(lists:member('EVENT_TYPE_TIMER_CANCELED', corpus_temporal:events(WE))).

batch_timed_out(_Config) ->
    %% The server skips timer(1h). Skipping waits for in-flight work, Archive's included, so
    %% Archive cannot be seen outliving Batch here; its ABANDON policy is read from history.
    WE = corpus_temporal:start_workflow(?TQ, ~"Batch", ~"timed-out", [[~"a"]], [
        {time_skipping_config, #{enabled => true}}
    ]),
    ?assertEqual(
        #{~"count" => 1, ~"audited" => true, ~"status" => ~"unacknowledged"},
        corpus_temporal:result(WE)
    ),
    Policies = [
        {maps:get(name, maps:get(workflow_type, A)), maps:get(parent_close_policy, A)}
     || #{attributes := {start_child_workflow_execution_initiated_event_attributes, A}} <-
            corpus_temporal:history(WE)
    ],
    ?assert(lists:member({~"Archive", 'PARENT_CLOSE_POLICY_ABANDON'}, Policies)).

tie_ack_listed_timer_fired_first(_) -> tie(~"Ack", [?FIRED, ?SIGNALED]).
tie_ack_listed_signal_first(_) -> tie(~"Ack", [?SIGNALED, ?FIRED]).
tie_timer_listed_timer_fired_first(_) -> tie(~"timer", [?FIRED, ?SIGNALED]).
tie_timer_listed_signal_first(_) -> tie(~"timer", [?SIGNALED, ?FIRED]).

tie(First, Order) ->
    case run_tie(First, Order, 3, []) of
        {tie, Winner, Events} ->
            ?assertEqual(First, Winner),
            %% The timer fired, so the losing timer is never cancelled.
            ?assertNot(lists:member('EVENT_TYPE_TIMER_CANCELED', Events));
        {missed, Misses} ->
            {skip, io_lib:format("no one-task tie in ~b attempts: ~p", [length(Misses), Misses])}
    end.

%% Sets up the tie: Go at 0.3 s opens a 3.5 s workflow task, and Ack is sent either at 0.5 s
%% (before the 1 s timer fires) or at 3 s (after it), so the next task holds both in the chosen
%% history order. Timing can miss on a loaded runner, so each attempt runs on a fresh task queue
%% and workflow ID, and a miss is returned, never asserted on.
run_tie(_First, _Order, 0, Misses) ->
    {missed, lists:reverse(Misses)};
run_tie(First, Order, Left, Misses) ->
    TQ = iolist_to_binary(["tie-", integer_to_list(erlang:unique_integer([positive]))]),
    Id = binary_to_atom(TQ),
    {ok, _} = corpus_temporal:start_worker(workflow, Id, TQ, #{
        ~"AwaitOneTie" => concurrency_await_one_tie
    }),
    try
        Label = [string:lowercase(First), "-listed-", order_label(Order)],
        WE = corpus_temporal:start_workflow(TQ, ~"AwaitOneTie", Label, [First]),
        timer:sleep(300),
        corpus_temporal:signal(WE, ~"Go", []),
        timer:sleep(
            case Order of
                [?SIGNALED, ?FIRED] -> 200;
                _ -> 2_700
            end
        ),
        corpus_temporal:signal(WE, ~"Ack", []),
        Winner = corpus_temporal:result(WE),
        Events = corpus_temporal:events(WE),
        case tie_task(Events) of
            Order -> {tie, Winner, Events};
            Other -> run_tie(First, Order, Left - 1, [{maps:get(workflow_id, WE), Other} | Misses])
        end
    after
        corpus_temporal:stop_worker(workflow, Id)
    end.

order_label([?FIRED, ?SIGNALED]) -> "timer-fired-first";
order_label([?SIGNALED, ?FIRED]) -> "signal-first".

%% The timer fire and Ack among the events between the Go task's completion and the next task.
tie_task(Events) ->
    AfterGo = lists:dropwhile(fun(E) -> E =/= ?SIGNALED end, Events),
    [_Completed | Rest] = lists:dropwhile(
        fun(E) -> E =/= 'EVENT_TYPE_WORKFLOW_TASK_COMPLETED' end, AfterGo
    ),
    Task = lists:takewhile(fun(E) -> E =/= 'EVENT_TYPE_WORKFLOW_TASK_STARTED' end, Rest),
    [E || E <- Task, E =:= ?FIRED orelse E =:= ?SIGNALED].
