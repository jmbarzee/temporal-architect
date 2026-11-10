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
    case wait_all([Count, Audit]) of
        [#{state := completed, result := [N]}, #{state := completed, result := [Audited]}] ->
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
                    fail_workflow_execution(#{message => ~"Archive did not start"});
                #{} ->
                    %% Never wait for the result; let the caller close while the child runs.
                    await_open_before_close(false),
                    T = start_timer({1, hour}),
                    race(T),
                    complete_workflow_execution([
                        #{~"count" => N, ~"audited" => Audited, ~"status" => get(status)}
                    ])
            end;
        [#{state := CountState}, #{state := AuditState}] ->
            fail_workflow_execution(#{
                message => iolist_to_binary(
                    io_lib:format("Count ~p, Audit ~p", [CountState, AuditState])
                )
            })
    end.

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
