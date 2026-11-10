-module(messages_promise_then_await).
-moduledoc "Fixture: a promise bound before X \"1\" arrives gets it, though an await looks first.".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [TimerMs]) ->
    corpus_arrivals:on(~"X"),
    P = corpus_arrivals:promise(~"X"),
    start_timer(TimerMs, [wait]),
    [Awaited] = corpus_arrivals:take(~"X"),
    [Promised] = corpus_arrivals:await(P),
    complete_workflow_execution([#{~"promise" => Promised, ~"await" => Awaited}]).
