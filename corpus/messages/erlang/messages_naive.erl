-module(messages_naive).
-moduledoc """
Fixture, the naive mapping: wait on `{signal, X}` per waiter. Both arrive before the first look,
so the index holds only the latest arrival, and the second wait returns it again at once.
""".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [TimerMs]) ->
    start_timer(TimerMs, [wait]),
    #{input := [A]} = wait({signal, ~"X"}),
    #{input := [B]} = wait({signal, ~"X"}),
    complete_workflow_execution([[A, B]]).
