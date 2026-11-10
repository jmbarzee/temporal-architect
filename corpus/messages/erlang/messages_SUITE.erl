-module(messages_SUITE).
-moduledoc """
Approval end to end, and the fixtures that pin spec 06's arrival rule and `await one`'s
condition case. `update Review` is skipped: the SDK has none at the pin.
""".

-include_lib("stdlib/include/assert.hrl").

-export([all/0, suite/0, init_per_suite/1, end_per_suite/1]).
-export([
    approval/1,
    waiter_order/1,
    promise_at_binding/1,
    await_one_case_wins/1,
    await_one_timer_wins/1,
    await_one_condition_set_wins/1,
    await_one_condition_set_then_unset/1,
    naive_reads_latest_twice/1
]).

-define(TQ, ~"messages-test-erlang").
-define(FIXTURES_TQ, ~"messages-fixtures-test-erlang").

suite() -> [{timetrap, {minutes, 2}}].

all() ->
    [
        approval,
        waiter_order,
        promise_at_binding,
        await_one_case_wins,
        await_one_timer_wins,
        await_one_condition_set_wins,
        await_one_condition_set_then_unset,
        naive_reads_latest_twice
    ].

fixtures() ->
    #{
        ~"WaiterOrder" => messages_waiter_order,
        ~"PromiseThenAwait" => messages_promise_then_await,
        ~"AwaitOne" => messages_await_one,
        ~"ConditionCase" => messages_condition_case,
        ~"Naive" => messages_naive
    }.

init_per_suite(Config) ->
    ok = corpus_temporal:start(),
    {ok, #{worker_id := Id}} = messages_workers:start_approval_types(?TQ),
    {ok, _} = corpus_temporal:start_worker(workflow, messages_fixtures, ?FIXTURES_TQ, fixtures()),
    [{worker_id, Id} | Config].

end_per_suite(Config) ->
    corpus_temporal:stop_worker(workflow, proplists:get_value(worker_id, Config)),
    corpus_temporal:stop_worker(workflow, messages_fixtures),
    ok.

%% Sends `Name` with each input in turn, 2 s apart from the start (the dev server's timers are not
%% finer than that).
with_signals(Type, Label, Input, Name, Inputs) ->
    WE = corpus_temporal:start_workflow(?FIXTURES_TQ, Type, Label, Input),
    lists:foreach(
        fun(Args) ->
            timer:sleep(2_000),
            corpus_temporal:signal(WE, Name, Args)
        end,
        Inputs
    ),
    corpus_temporal:result(WE).

with_two_xs(Type, Label, Input) -> with_signals(Type, Label, Input, ~"X", [[~"1"], [~"2"]]).

%% A signal ahead of the first workflow task records a history the SDK cannot replay at the pin
%% (#524's upstream draft 1), so a test sends its first signal only once that task completed. The
%% history so far, not `corpus_temporal:events/1`, which waits for the close.
await_first_task(WE) ->
    {ok, #{history := #{events := Events}}} = temporal_sdk:get_workflow_history(
        corpus_temporal:cluster(), WE, [{await_all_close, false}]
    ),
    case [E || #{event_type := 'EVENT_TYPE_WORKFLOW_TASK_COMPLETED'} = E <- Events] of
        [] ->
            timer:sleep(100),
            await_first_task(WE);
        _ ->
            ok
    end.

approval(_Config) ->
    WE = corpus_temporal:start_workflow(?TQ, ~"Approval", ~"open-approve", [~"req-1"]),
    await_first_task(WE),
    corpus_temporal:signal(WE, ~"Open", []),
    timer:sleep(1_500),
    ?assertMatch({ok, #{query_result := [~"open"]}}, corpus_temporal:query(WE, ~"Status")),
    corpus_temporal:signal(WE, ~"Approve", [~"ann"]),
    ?assertEqual(
        #{~"request" => ~"req-1", ~"approver" => ~"ann", ~"note" => null, ~"status" => ~"approved"},
        corpus_temporal:result(WE)
    ),
    ?assertMatch({ok, #{query_result := [~"approved"]}}, corpus_temporal:query(WE, ~"Status")).

waiter_order(_Config) ->
    ?assertEqual(
        #{~"began first" => ~"1", ~"began second" => ~"2"},
        with_two_xs(~"WaiterOrder", ~"began-order", [])
    ).

promise_at_binding(_Config) ->
    ?assertEqual(
        #{~"promise" => ~"1", ~"await" => ~"2"},
        with_two_xs(~"PromiseThenAwait", ~"binding", [3_000])
    ).

await_one_case_wins(_Config) ->
    ?assertEqual([~"case 1", ~"then 2"], with_two_xs(~"AwaitOne", ~"signal-wins", [20_000])).

await_one_timer_wins(_Config) ->
    ?assertEqual([~"timer", ~"then 1"], with_two_xs(~"AwaitOne", ~"timer-wins", [300])).

await_one_condition_set_wins(_Config) ->
    ?assertEqual(
        ~"ready", with_signals(~"ConditionCase", ~"set-wins", [3_000, 6_000], ~"Ready", [[true]])
    ).

await_one_condition_set_then_unset(_Config) ->
    ?assertEqual(
        ~"timer",
        with_signals(
            ~"ConditionCase", ~"set-then-unset", [3_000, 6_000], ~"Ready", [[true], [false]]
        )
    ).

naive_reads_latest_twice(_Config) ->
    ?assertEqual([~"2", ~"2"], with_two_xs(~"Naive", ~"latest-twice", [5_000])).
