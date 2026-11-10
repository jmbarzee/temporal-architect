-module(corpus_arrivals).
-moduledoc """
A signal's pending arrivals and the waiters for them, kept in the calling workflow execution.

The SDK keeps one index entry per signal name: a later arrival overwrites the entry and the
earlier ones survive only in its `history` list, and `{signal, Name}` stays ready forever. So
arrivals are read from that entry by event id, each runs its handler once, and the index is
admitted so `{signal_request, Name}` blocks until the next one.

Every waiter of a name lives in one execution (the main one): a promise takes a ticket at its
binding and gets arrivals in ticket order; an `await one` case peeks and claims only if it wins.
Names are binaries.
""".

-export([
    on/1,
    on/2,
    promise/1,
    take/1,
    await/1,
    ready_at/1,
    claim/1,
    sync/1,
    task_of/1,
    arrival_task/0,
    timer_ready_at/1,
    first/1
]).

-doc "Registers a name and its handler body (run once per arrival, in history order).".
on(Name) -> on(Name, fun(_Args) -> ok end).

on(Name, Handler) ->
    put_st(Name, #{
        handler => Handler, seen => 0, pending => [], tickets => [], resolved => #{}, next => 0
    }),
    keep_open().

%% The SDK's await returns noevent at once when the run has no open Temporal task (a signal is not
%% one), so a run that may wait on signals alone holds one long timer open, and must not wait for
%% it at close.
keep_open() ->
    case get({?MODULE, keep_open}) of
        true ->
            ok;
        undefined ->
            temporal_sdk_workflow:start_timer({3650, day}, [{timer_id, ~"arrivals-keep-open"}]),
            temporal_sdk_workflow:await_open_before_close(false),
            put({?MODULE, keep_open}, true),
            ok
    end.

-doc "`promise p <- signal X`: the ticket is taken now, so the promise begins waiting at its binding.".
promise(Name) ->
    sync(Name),
    #{next := T, tickets := Ts} = St = get_st(Name),
    put_st(Name, assign(St#{next := T + 1, tickets := Ts ++ [T]})),
    {Name, T}.

-doc "`await signal X`: a promise awaited at once.".
take(Name) -> await(promise(Name)).

-doc "`await p`: waits until the arrival given to the promise's ticket.".
await({Name, T} = P) ->
    sync(Name),
    #{resolved := Resolved} = St = get_st(Name),
    case Resolved of
        #{T := Args} ->
            put_st(Name, St#{resolved := maps:remove(T, Resolved)}),
            Args;
        #{} ->
            temporal_sdk_workflow:await({signal_request, Name}),
            await(P)
    end.

-doc """
For an `await one` signal case: the workflow task in which its oldest pending arrival became
visible (see `task_of/1`), or undefined when none is pending (no earlier waiter is owed one).
""".
ready_at(Name) ->
    sync(Name),
    case get_st(Name) of
        #{pending := [{Eid, _Args} | _]} -> task_of(Eid);
        #{pending := []} -> undefined
    end.

-doc "Takes the oldest pending arrival for the `await one` signal case that won.".
claim(Name) ->
    #{pending := [{_Eid, Args} | Rest]} = St = get_st(Name),
    put_st(Name, St#{pending := Rest}),
    Args.

-doc "Reads arrivals not seen yet, runs their handlers, queues them, and admits the index.".
sync(Name) ->
    #{seen := Seen, handler := Handler, pending := Pending} = St = get_st(Name),
    case temporal_sdk_workflow:is_awaited({signal, Name}) of
        {true, Data} ->
            New = lists:sort(
                fun(A, B) -> eid(A) =< eid(B) end,
                [A || A <- [Data | maps:get(history, Data, [])], eid(A) > Seen]
            ),
            lists:foreach(
                fun(#{event_id := Eid, input := Input}) ->
                    put({?MODULE, arrival}, Eid),
                    Handler(Input)
                end,
                New
            ),
            erase({?MODULE, arrival}),
            Seen1 = lists:foldl(fun(A, M) -> max(eid(A), M) end, Seen, New),
            Pending1 = Pending ++ [{eid(A), maps:get(input, A)} || A <- New],
            put_st(Name, assign(St#{seen := Seen1, pending := Pending1})),
            case Data of
                #{state := requested} -> temporal_sdk_workflow:admit_signal(Name, [wait]);
                #{} -> ok
            end;
        {false, _} ->
            ok
    end,
    ok.

-doc """
The workflow task that first saw history event `Eid`: the first WorkflowTaskStarted after it.
Replay applies history up to the next commanded event, not task by task, so a run that resumed
with no command can see later events on replay than it did live. An `await one` decided by
"which case became ready in the earliest task, then the first listed" sees the same as live.
""".
task_of(Eid) ->
    Spec = [{{'$1', 'EVENT_TYPE_WORKFLOW_TASK_STARTED', '_', '_'}, [{'>', '$1', Eid}], ['$1']}],
    case temporal_sdk_workflow:select_history(Spec) of
        [] -> infinity;
        Ids -> lists:min(Ids)
    end.

-doc """
In a handler body, the workflow task of the arrival it handles (see `task_of/1`). A body that
sets a condition records it, so an `await one` condition case ranks by the setting arrival.
""".
arrival_task() -> task_of(get({?MODULE, arrival})).

-doc "For an `await one` timer case: the task in which it fired, or undefined.".
timer_ready_at(T) ->
    case temporal_sdk_workflow:is_awaited(T) of
        {true, #{state := fired, event_id := Eid}} -> task_of(Eid);
        _ -> undefined
    end.

-doc """
The winning case of an `await one`: `Cases` is `[{Key, ReadyAt}]` in listed order; the case
ready in the earliest task wins, and the first listed among those. undefined when none is ready.
""".
first(Cases) ->
    case [C || {_K, At} = C <- Cases, At =/= undefined] of
        [] ->
            undefined;
        [C0 | Rest] ->
            {K, _} = lists:foldl(
                fun({_, At} = C, {_, Best}) when At < Best -> C; (_, Acc) -> Acc end, C0, Rest
            ),
            K
    end.

%% Gives pending arrivals to tickets, oldest to the earliest.
assign(#{pending := [{_Eid, Args} | Ps], tickets := [T | Ts], resolved := R} = St) ->
    assign(St#{pending := Ps, tickets := Ts, resolved := R#{T => Args}});
assign(St) ->
    St.

eid(#{event_id := Eid}) -> Eid.

get_st(Name) -> get({?MODULE, Name}).
put_st(Name, St) -> put({?MODULE, Name}, St).
