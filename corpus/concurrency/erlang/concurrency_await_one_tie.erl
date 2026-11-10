-module(concurrency_await_one_tie).
-moduledoc """
Fixture: `await one` over Ack and timer(1s), listed with `First` (~"Ack" or ~"timer") first, for
the engineered tie. A Go signal opens a workflow task that sleeps 3.5 s; the timer fires and Ack
arrives meanwhile, so the next task holds both, and the first listed must win.
""".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [First]) ->
    corpus_arrivals:on(~"Go"),
    corpus_arrivals:on(~"Ack"),
    T = start_timer(1_000),
    corpus_arrivals:take(~"Go"),
    %% Holds this workflow task open; history appended meanwhile reaches the next task together.
    timer:sleep(3_500),
    Cases =
        case First of
            ~"Ack" -> [ack, timer];
            ~"timer" -> [timer, ack]
        end,
    complete_workflow_execution([race(Cases, T)]).

race(Cases, T) ->
    case corpus_arrivals:first([{C, ready_at(C, T)} || C <- Cases]) of
        ack ->
            corpus_arrivals:claim(~"Ack"),
            %% Cancelling a fired timer raises, so a losing timer is cancelled only if unfired.
            corpus_arrivals:timer_ready_at(T) =:= undefined andalso cancel_timer(T),
            ~"Ack";
        timer ->
            ~"timer";
        undefined ->
            await_any([{signal_request, ~"Ack"}, T]),
            race(Cases, T)
    end.

ready_at(ack, _T) -> corpus_arrivals:ready_at(~"Ack");
ready_at(timer, T) -> corpus_arrivals:timer_ready_at(T).
