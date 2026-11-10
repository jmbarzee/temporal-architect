-module(messages_replay_SUITE).
-moduledoc "Replays every recorded history in histories/, each completed run to its recorded result.".

-include_lib("stdlib/include/assert.hrl").

-export([all/0, init_per_suite/1, end_per_suite/1, replays/1]).

all() -> [replays].

init_per_suite(Config) ->
    ok = corpus_temporal:start(),
    Config.

end_per_suite(_Config) -> ok.

names() ->
    maps:merge(messages_workers:approval_types_workflows(), #{
        ~"WaiterOrder" => messages_waiter_order,
        ~"PromiseThenAwait" => messages_promise_then_await,
        ~"AwaitOne" => messages_await_one,
        ~"ConditionCase" => messages_condition_case,
        ~"Naive" => messages_naive
    }).

replays(_Config) ->
    Source = proplists:get_value(source, ?MODULE:module_info(compile)),
    Files = filelib:wildcard(filename:join(filename:dirname(Source), "histories/*.json")),
    ?assertNotEqual([], Files),
    Failed = [
        {filename:basename(F), R}
     || F <- Files, R <- [corpus_temporal:replay(F, names())], element(1, R) =/= ok
    ],
    ?assertEqual([], Failed).
