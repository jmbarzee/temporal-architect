-module(concurrency_batch).
-moduledoc "workflow Batch(items: list[string]) -> (Report)".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(Context, [Items]) ->
    put(status, ~"unacknowledged"),
    corpus_arrivals:on(~"Ack", fun([]) -> put(status, ~"acknowledged") end),
    #{
        worker_opts := #{task_queue := TaskQueue},
        task := #{workflow_execution := #{workflow_id := Wid}}
    } = Context,

    %% await all: activity Count(items) -> count; workflow Audit(items) -> audited.
    Count = start_activity(~"Count", [Items]),
    Audit = start_child_workflow(TaskQueue, ~"Audit", [
        {input, [Items]}, {workflow_id, <<Wid/binary, "/Audit">>}
    ]),
    case wait_branches([Count, Audit]) of
        {failed, Branch} ->
            await_open_before_close(false),
            fail_workflow_execution(failure(Branch));
        {ok, [#{result := [N]}, #{result := [Audited]}]} ->
            %% detach workflow Archive(items)
            Archive = start_child_workflow(TaskQueue, ~"Archive", [
                {input, [Items]},
                {workflow_id, <<Wid/binary, "/Archive">>},
                {parent_close_policy, 'PARENT_CLOSE_POLICY_ABANDON'},
                {awaitable_event, start},
                wait
            ]),
            case Archive of
                #{state := initiate_failed} ->
                    fail_workflow_execution(#{message => "Archive did not start"});
                #{} ->
                    %% Never wait for the result; let the caller close while the child runs.
                    await_open_before_close(false),
                    T = start_timer({1, hour}),
                    race(T),
                    complete_workflow_execution([
                        #{~"count" => N, ~"audited" => Audited, ~"status" => get(status)}
                    ])
            end
    end.

-define(FAILED, [failed, timedout, canceled, terminated, initiate_failed]).

%% await all (skills/temporal-architect-author-erlang/reference/await-all.md): the branches' data
%% maps in listed order, or the first branch to fail, by workflow task then listed order.
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

%% The branch's message, application type and details, the message as a charlist.
failure(#{failure := F}) ->
    Info =
        case F of
            #{failure_info := {application_failure_info, I}} -> maps:with([type, details], I);
            #{} -> #{}
        end,
    Info#{message => unicode:characters_to_list(maps:get(message, F, ~""))};
failure(#{state := State}) ->
    #{message => atom_to_list(State)}.

%% Listed order: signal Ack, then the timer.
race(T) ->
    Cases = [{ack, corpus_arrivals:ready_at(~"Ack")}, {timer, corpus_arrivals:timer_ready_at(T)}],
    case corpus_arrivals:first(Cases) of
        ack ->
            corpus_arrivals:claim(~"Ack"),
            %% Cancelling a fired timer raises, so the losing inline timer is cancelled only if unfired.
            corpus_arrivals:timer_ready_at(T) =:= undefined andalso cancel_timer(T),
            ack;
        timer ->
            timer;
        undefined ->
            await_any([{signal_request, ~"Ack"}, T]),
            race(T)
    end.
