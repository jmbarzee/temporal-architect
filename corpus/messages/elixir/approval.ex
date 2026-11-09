defmodule Messages.Approval do
  @moduledoc """
  workflow Approval(request: string) -> (Decision).
  `update Review` is not mapped: the SDK at d2749c7 has no update handling (TODO.md:3), so the
  update step and its `note` are skipped.
  """
  use TemporalSdk.Workflow
  alias Corpus.Arrivals

  @impl true
  def execute(_context, [request]) do
    Process.put(:status, "submitted")
    Arrivals.on("Open", fn [] -> Process.put(:status, "open") end)
    Arrivals.on("Approve", fn [_approver] -> Process.put(:status, "approved") end)
    publish()
    start_execution(:status_query)

    Arrivals.take("Open")
    publish()
    approval = Arrivals.promise("Approve")
    # await update Review -> (note): unsupported at the pin
    [approver] = Arrivals.await(approval)
    publish()

    complete_workflow_execution([
      %{"request" => request, "approver" => approver, "note" => :null, "status" => Process.get(:status)}
    ])
  end

  # The query handler is a parallel execution answering from the state the main one publishes.
  def status_query(_context, _input) do
    case await({:query_request, "Status"}) do
      {:ok, _request} ->
        {true, status} = is_awaited({:info, :status})
        respond_query({:query, "Status"}, [:wait, answer: [status]])
        status_query(%{}, [])

      {:noevent, _} ->
        :ok
    end
  end

  # A closed run has no execution left, so the callback answers from its history.
  @impl true
  def handle_query(history, %{query_type: "Status"}), do: %{answer: [status_from(history)]}

  # The signal bodies' effects, applied over the run's signal events in history order.
  defp status_from(history) do
    Enum.reduce(history, "submitted", fn
      {_, :EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED, %{signal_name: "Open"}, _}, _ -> "open"
      {_, :EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED, %{signal_name: "Approve"}, _}, _ -> "approved"
      _, status -> status
    end)
  end

  defp publish, do: set_info(Process.get(:status), info_id: :status)
end
