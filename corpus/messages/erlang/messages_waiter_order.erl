-module(messages_waiter_order).
-moduledoc "Fixture: two promises bound in order, awaited in reverse: arrivals follow binding order.".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, _Input) ->
    corpus_arrivals:on(~"X"),
    First = corpus_arrivals:promise(~"X"),
    Second = corpus_arrivals:promise(~"X"),
    [B] = corpus_arrivals:await(Second),
    [A] = corpus_arrivals:await(First),
    complete_workflow_execution([#{~"began first" => A, ~"began second" => B}]).
