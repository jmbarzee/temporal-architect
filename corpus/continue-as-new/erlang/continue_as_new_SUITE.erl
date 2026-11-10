-module(continue_as_new_SUITE).
-moduledoc "Counter completing at its limit, and continuing as new below it.".

-include_lib("stdlib/include/assert.hrl").

-export([all/0, suite/0, init_per_suite/1, end_per_suite/1]).
-export([completes_at_the_limit/1, continues_as_new_below_it/1]).

-define(TQ, ~"counters-test-erlang").
%% The server skips each run's timer(1m), and each continued run inherits the setting.
-define(SKIP, [{time_skipping_config, #{enabled => true}}]).

suite() -> [{timetrap, {minutes, 2}}].

all() -> [completes_at_the_limit, continues_as_new_below_it].

init_per_suite(Config) ->
    ok = corpus_temporal:start(),
    %% The workflow and activity workers share the default worker ID, built from the queue.
    {ok, #{worker_id := Id}} = continue_as_new_workers:start_counter_types(?TQ),
    [{worker_id, Id} | Config].

end_per_suite(Config) ->
    Id = proplists:get_value(worker_id, Config),
    corpus_temporal:stop_worker(workflow, Id),
    corpus_temporal:stop_worker(activity, Id),
    ok.

completes_at_the_limit(_Config) ->
    WE = corpus_temporal:start_workflow(?TQ, ~"Counter", ~"completed", [2, 3], ?SKIP),
    ?assertEqual(3, corpus_temporal:result(WE)).

continues_as_new_below_it(_Config) ->
    WE = corpus_temporal:start_workflow(?TQ, ~"Counter", ~"continued", [0, 3], ?SKIP),
    ?assertEqual(3, corpus_temporal:result(WE)),
    ?assertEqual(
        'EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW', lists:last(corpus_temporal:events(WE))
    ).
