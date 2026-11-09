# query handler

```twf
query GetStatus() -> (string):
	return status
```

```elixir
# in execute/2, before the first wait:
publish()
start_execution(:status_query)
# ... publish() again after each change to the state a query reads

# The query handler is a parallel execution answering from the state the main one publishes.
def status_query(_context, _input) do
  case await({:query_request, "GetStatus"}) do
    {:ok, _request} ->
      {true, status} = is_awaited({:info, :status})
      respond_query({:query, "GetStatus"}, [:wait, answer: [status]])
      status_query(%{}, [])

    {:noevent, _} ->
      :ok
  end
end

# A closed run has no execution left, so the callback answers from its history.
@impl true
def handle_query(history, %{query_type: "GetStatus"}), do: %{answer: [status_from(history)]}

defp publish, do: set_info(Process.get(:status), info_id: :status)
```

- An open run's query is an awaitable, `{:query_request, "GetStatus"}` (`temporal_sdk/temporal_sdk_workflow.erl:1243-1245`). A function started with `start_execution(:status_query)` waits on it, answers with `respond_query(…, [:wait, answer: [value]])`, and loops (`:2340-2367,2775-2785`). The answer is a payload list. Params arrive positionally in the request's `query_args` list (`:1255-1261`). [`corpus/messages/elixir/approval.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/elixir/approval.ex) is the worked example.
- **State reaches the query through `set_info`.** The execution runs in its own process (`executor/temporal_sdk_executor_workflow.erl:2182-2195`) and cannot read the main execution's process dictionary. The main execution publishes with `set_info(value, info_id: :status)`, and the query reads it with `is_awaited({:info, :status})` (`temporal_sdk/temporal_sdk_workflow.erl:2842-2869,2662-2670`). Publish after the syncs that change it ([signal-handler.md](./signal-handler.md)), since a query sees only what was published.
- The loop ends on `:noevent`, when the run has nothing left open (`executor/temporal_sdk_executor_workflow.erl:687-690`).
- **A closed run answers through `handle_query/2`.** A query task for a run no executor holds, a closed one included, starts a fresh executor that calls the callback with the run's history events and the query (`poller/temporal_sdk_poller_adapter_workflow_task_queue.erl:64-71`, `api/temporal_sdk_api_workflow_task.erl:48-50`, `executor/temporal_sdk_executor_workflow.erl:392-393,1388-1400`). Without it, the query fails with `"Undefined handle_query/2 callback."`. The state is gone, so `status_from/1` derives the answer from the events, `{event_id, event_type, attributes, data}` (`temporal_sdk/temporal_sdk_workflow.erl:353-358`), such as the closing event's result.
- `description` is unsupported: a query has no registration, and `respond_query`'s options are `answer`, `error_message`, `failure`, `awaitable_event` and `wait` (`temporal_sdk/temporal_sdk_workflow.erl:2346-2353`). Drop it.
