-module(messages_await_one).
-moduledoc "Fixture: await one { signal X, timer(d) } then await signal X: a case takes only if it wins.".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [TimerMs]) ->
    corpus_arrivals:on(~"X"),
    T = start_timer(TimerMs),
    First = race(T),
    [Then] = corpus_arrivals:take(~"X"),
    complete_workflow_execution([[First, <<"then ", Then/binary>>]]).

%% Listed order: signal X, then the timer. The losing inline timer is cancelled.
race(T) ->
    Cases = [{x, corpus_arrivals:ready_at(~"X")}, {timer, corpus_arrivals:timer_ready_at(T)}],
    case corpus_arrivals:first(Cases) of
        x ->
            [V] = corpus_arrivals:claim(~"X"),
            %% Cancelling a fired timer raises, so the losing timer is cancelled only if unfired.
            corpus_arrivals:timer_ready_at(T) =:= undefined andalso cancel_timer(T),
            <<"case ", V/binary>>;
        timer ->
            ~"timer";
        undefined ->
            await_any([{signal_request, ~"X"}, T]),
            race(T)
    end.
