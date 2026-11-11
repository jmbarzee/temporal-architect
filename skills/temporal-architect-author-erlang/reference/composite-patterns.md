# composite patterns

Bugs cluster where patterns combine. author-elixir's two worked compositions, in Erlang; why each is tricky: [author-elixir composite-patterns.md](../../temporal-architect-author-elixir/reference/composite-patterns.md).

## Pattern 1: Signal-set condition vs timer (ManageRetention)

```twf
workflow ManageRetention(docId: string, retentionDays: int):
	state:
		condition cancelled

	signal CancelRetention():
		set cancelled

	await one:
		cancelled:
			activity DeleteDocument(docId)
			close complete
		timer(retentionDays * 24h):
			activity DeleteDocument(docId)
			close complete
```

```erlang
-module(retention_manage_retention).

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [DocId, RetentionDays]) ->
    put(cancelled, undefined),
    corpus_arrivals:on(~"CancelRetention", fun([]) ->
        case get(cancelled) of
            undefined -> put(cancelled, corpus_arrivals:arrival_task());
            _ -> ok
        end
    end),
    T = start_timer({RetentionDays, day}),
    race(T),
    case start_activity(~"DeleteDocument", [DocId], [{start_to_close_timeout, {1, minute}}, wait]) of
        #{state := completed} ->
            complete_workflow_execution([]);
        #{state := State} ->
            fail_workflow_execution(#{message => "DeleteDocument " ++ atom_to_list(State)})
    end.

%% Listed order: the condition, then the timer.
race(T) ->
    corpus_arrivals:sync(~"CancelRetention"),
    Cases = [{cancelled, get(cancelled)}, {timer, corpus_arrivals:timer_ready_at(T)}],
    case corpus_arrivals:first(Cases) of
        cancelled ->
            corpus_arrivals:timer_ready_at(T) =:= undefined andalso cancel_timer(T),
            ok;
        timer ->
            ok;
        undefined ->
            await_any([{signal_request, ~"CancelRetention"}, T]),
            race(T)
    end.
```

The condition is ranked by the task of the arrival that set it, `arrival_task/0`, which is `task_of/1` of that arrival's event ([condition.md](./condition.md)), never by a flag read after a wake-up; it never claims; and the losing timer is cancelled only if unfired ([await-one.md](./await-one.md#notes)).

## Pattern 2: Signal case vs a bound deadline, in a loop (CollectVotes)

```twf
workflow CollectVotes(pollId: string) -> (Tally):
	signal Vote():
		votes = votes + 1

	votes = 0
	promise deadline <- timer(24h)
	for:
		await one:
			signal Vote:
			deadline:
				close complete(Tally{votes: votes})
```

```erlang
execute(_Context, [_PollId]) ->
    put(votes, 0),
    corpus_arrivals:on(~"Vote", fun([]) -> put(votes, get(votes) + 1) end),
    Deadline = start_timer({24, hour}),
    collect(Deadline).

%% Listed order: signal Vote, then the deadline. A new round ranks afresh.
collect(Deadline) ->
    Cases = [
        {vote, corpus_arrivals:ready_at(~"Vote")},
        {deadline, corpus_arrivals:timer_ready_at(Deadline)}
    ],
    case corpus_arrivals:first(Cases) of
        vote ->
            corpus_arrivals:claim(~"Vote"),
            collect(Deadline);
        deadline ->
            complete_workflow_execution([#{~"votes" => get(votes)}]);
        undefined ->
            await_any([{signal_request, ~"Vote"}, Deadline]),
            collect(Deadline)
    end.
```

The deadline is a bound promise, so the loop passes the same handle and never cancels it (spec 06; [promise.md](./promise.md)). `Vote` is listed first, so votes ready in the deadline's task are each claimed before the deadline wins.
