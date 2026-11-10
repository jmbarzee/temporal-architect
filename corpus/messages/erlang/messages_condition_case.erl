-module(messages_condition_case).
-moduledoc """
Fixture: `signal Ready(on: bool)` sets or unsets the condition `ready`; after a hold, `await one`
{ timer(d), ready }. The condition case ranks by the task of the arrival that set it, so set
before the timer fired it wins though listed second, and set then unset it is not ready.
""".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [TimerMs, HoldMs]) ->
    %% condition ready: undefined while unset, else the task of the arrival that set it.
    put(ready, undefined),
    corpus_arrivals:on(~"Ready", fun
        ([true]) ->
            case get(ready) of
                undefined -> put(ready, corpus_arrivals:arrival_task());
                _ -> ok
            end;
        ([false]) ->
            put(ready, undefined)
    end),
    T = start_timer(TimerMs),
    start_timer(HoldMs, [wait]),
    complete_workflow_execution([race(T)]).

%% Listed order: the timer, then the condition.
race(T) ->
    corpus_arrivals:sync(~"Ready"),
    case corpus_arrivals:first([{timer, corpus_arrivals:timer_ready_at(T)}, {ready, get(ready)}]) of
        timer ->
            ~"timer";
        ready ->
            corpus_arrivals:timer_ready_at(T) =:= undefined andalso cancel_timer(T),
            ~"ready";
        undefined ->
            await_any([{signal_request, ~"Ready"}, T]),
            race(T)
    end.
