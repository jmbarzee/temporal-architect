# query handler

```twf
query GetStatus() -> (string):
	return status
```

```erlang
-export([execute/2, status_query/2, handle_query/2]).

%% in execute/2, before the first wait:
publish(),
start_execution(status_query),
%% ... publish() again after each change to the state a query reads

%% The query handler is a parallel execution answering from the state the main one publishes.
status_query(_Context, _Input) ->
    case await({query_request, ~"GetStatus"}) of
        {ok, _Request} ->
            {true, Status} = is_awaited({info, status}),
            respond_query({query, ~"GetStatus"}, [wait, {answer, [Status]}]),
            status_query(#{}, []);
        {noevent, _} ->
            ok
    end.

%% A closed run has no execution left, so the callback answers from its history.
handle_query(History, #{query_type := ~"GetStatus"}) -> #{answer => [status_from(History)]}.

publish() -> set_info(get(status), [{info_id, status}]).
```

The mechanics are [author-elixir query-handler.md](../../temporal-architect-author-elixir/reference/query-handler.md): an open run's query is the awaitable `{query_request, ~"GetStatus"}`, answered by a parallel execution with a payload list; a closed run's, by `handle_query/2`.

- **Export both functions.** `start_execution(status_query)` runs `status_query(Context, Input)` on the workflow's own module (`temporal_sdk/temporal_sdk_workflow.erl:2776-2787`, `executor/temporal_sdk_executor_workflow.erl:2195`), and a closed run's query calls `handle_query/2` only if it is exported, else it fails with `"Undefined handle_query/2 callback."` (`executor/temporal_sdk_executor_workflow.erl:1397-1399`).
- **State reaches the query through `set_info`**, its options a proplist, `[{info_id, status}]` (`temporal_sdk/temporal_sdk_workflow.erl:2850-2869`); the query reads it with `is_awaited({info, status})`. Publish after the syncs that change it ([signal-handler.md](./signal-handler.md)).
- `respond_query`'s options are a proplist too, `[wait, {answer, [Status]}]` (`temporal_sdk/temporal_sdk_workflow.erl:2342-2367`). Params arrive positionally in the request's `query_args` list.
- **`status_from/1` folds the history**, whose events are `{EventId, EventType, Attributes, Data}` with quoted enum atoms (`temporal_sdk/temporal_sdk_workflow.erl:353-358`), such as a signal's `{_, 'EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED', #{signal_name := ~"Approve"}, _}` (`api/awaitable/temporal_sdk_api_awaitable_index.erl:1296-1299`), or the closing event's result.
- `description` is unsupported ([author-elixir query-handler.md](../../temporal-architect-author-elixir/reference/query-handler.md)). Drop it.
