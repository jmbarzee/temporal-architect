-module(failure_job).
-moduledoc """
workflow Job(item: string).
`update Attempt` is not mapped: the SDK at d2749c7 has no update handling (TODO.md:3).
""".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

%% A branch in one of these states has failed; any other ready state is done.
-define(FAILED, [failed, timedout, canceled, terminated, initiate_failed]).

execute(_Context, [Item]) ->
    put(proceeding, undefined),
    corpus_arrivals:on(~"Proceed", fun([]) -> set_condition(proceeding) end),

    await_condition([~"Proceed"], fun() -> get(proceeding) =/= undefined end),

    %% await all: activity Reject(item); activity Process(item).
    Reject = start_activity(~"Reject", [Item], failure_reject:defaults()),
    Process = start_activity(~"Process", [Item]),
    case wait_branches([Reject, Process]) of
        {ok, _Results} ->
            complete_workflow_execution([]);
        {failed, Branch} ->
            %% The close would otherwise wait for every open activity, Process included.
            await_open_before_close(false),
            fail_workflow_execution(failure(Branch))
    end.

%% The branches' data maps in listed order, or the first branch to fail: the one that failed in
%% the earliest workflow task, the first listed among those. The others keep running.
wait_branches(Handles) ->
    Matches = [is_awaited(H) || H <- Handles],
    Failed = [
        {corpus_arrivals:task_of(Eid), M}
     || {true, #{state := S, event_id := Eid} = M} <- Matches, lists:member(S, ?FAILED)
    ],
    case Failed of
        [_ | _] ->
            {failed, element(2, hd(lists:keysort(1, Failed)))};
        [] ->
            case [H || {H, {false, _}} <- lists:zip(Handles, Matches)] of
                [] -> {ok, [M || {true, M} <- Matches]};
                Open -> wait_any(Open), wait_branches(Handles)
            end
    end.

%% The run fails with the branch's failure: its message, application type and details. The
%% message goes as a charlist, since the default serializer prints any other term.
failure(#{failure := F}) ->
    Info =
        case F of
            #{failure_info := {application_failure_info, I}} -> maps:with([type, details], I);
            #{} -> #{}
        end,
    Info#{message => unicode:characters_to_list(maps:get(message, F, ~""))};
failure(#{state := State}) ->
    #{message => atom_to_list(State)}.

%% A set keeps the task already recorded: the condition became true at the first set after the last unset.
set_condition(C) ->
    case get(C) of
        undefined -> put(C, corpus_arrivals:arrival_task());
        _ -> ok
    end.

%% Waits until Cond holds; only the bodies of signals in Names can set it.
await_condition(Names, Cond) ->
    lists:foreach(fun corpus_arrivals:sync/1, Names),
    case Cond() of
        true ->
            ok;
        false ->
            await_any([{signal_request, N} || N <- Names]),
            await_condition(Names, Cond)
    end.
