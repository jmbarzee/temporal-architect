-module(failure_SUITE).
-moduledoc """
Job end to end: `await all` fails the run with Reject's failure while Process still runs, never
cancelled. The update case (update Attempt fails that update and the run goes on) is skipped: the
SDK at the pin has no update handling.
""".

-include_lib("stdlib/include/assert.hrl").

-export([all/0, suite/0, init_per_suite/1, end_per_suite/1, reject_fails/1]).

-define(TQ, ~"jobs-test-erlang").

suite() -> [{timetrap, {minutes, 2}}].

all() -> [reject_fails].

init_per_suite(Config) ->
    ok = corpus_temporal:start(),
    %% The workflow and activity workers share the default worker ID, built from the queue.
    {ok, #{worker_id := Id}} = failure_workers:start_job_types(?TQ),
    [{worker_id, Id} | Config].

end_per_suite(Config) ->
    Id = proplists:get_value(worker_id, Config),
    corpus_temporal:stop_worker(workflow, Id),
    corpus_temporal:stop_worker(activity, Id),
    ok.

%% A signal ahead of the first workflow task records a history the SDK cannot replay at the pin
%% (#524's upstream draft 1), so the test signals only once that task completed.
await_first_task(WE) -> await_first_task(WE, 50).

await_first_task(_WE, 0) ->
    ct:fail("the first workflow task never completed");
await_first_task(WE, Tries) ->
    {ok, #{history := #{events := Events}}} = temporal_sdk:get_workflow_history(
        corpus_temporal:cluster(), WE, [{await_all_close, false}]
    ),
    case [E || #{event_type := 'EVENT_TYPE_WORKFLOW_TASK_COMPLETED'} = E <- Events] of
        [] ->
            timer:sleep(100),
            await_first_task(WE, Tries - 1);
        _ ->
            ok
    end.

reject_fails(_Config) ->
    WE = corpus_temporal:start_workflow(?TQ, ~"Job", ~"reject-fails", [~"item-1"]),
    await_first_task(WE),
    corpus_temporal:signal(WE, ~"Proceed", []),

    %% Bounded: a wait-for-all run would fail only after Process's 5 s, with its completion recorded.
    ?assertMatch(
        {ok,
            {failed, #{
                failure := #{
                    message := ~"rejected item-1",
                    failure_info := {_, #{type := ~"Rejected"}}
                }
            }}},
        temporal_sdk:await_workflow(corpus_temporal:cluster(), WE, [{timeout, {30, second}}])
    ),

    History = corpus_temporal:history(WE),
    Types = [maps:get(event_type, E) || E <- History],
    ?assertEqual('EVENT_TYPE_WORKFLOW_EXECUTION_FAILED', lists:last(Types)),

    %% Process was scheduled before Reject failed, so the branches ran together, not in turn.
    ProcessScheduled = index_of(
        fun(E) -> match_activity_type(E, ~"Process") end, History
    ),
    RejectFailed = index_of(fun(T) -> T =:= 'EVENT_TYPE_ACTIVITY_TASK_FAILED' end, Types),
    ?assertNotEqual(undefined, ProcessScheduled, "Process was not scheduled"),
    ?assert(ProcessScheduled < RejectFailed),

    %% The closed history holds no close of Process, and no cancel request: the run failed first.
    ?assertNot(lists:member('EVENT_TYPE_ACTIVITY_TASK_COMPLETED', Types)),
    ?assertNot(lists:member('EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED', Types)).

match_activity_type(#{attributes := {_, #{activity_type := #{name := Name}}}}, Name) -> true;
match_activity_type(_, _) -> false.

index_of(Pred, List) -> index_of(Pred, List, 1).

index_of(_Pred, [], _I) -> undefined;
index_of(Pred, [X | Rest], I) ->
    case Pred(X) of
        true -> I;
        false -> index_of(Pred, Rest, I + 1)
    end.
