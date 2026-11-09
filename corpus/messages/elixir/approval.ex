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
    publish()
    Arrivals.on("Open", fn _ -> Process.put(:status, "open") end)
    Arrivals.on("Approve", fn [_approver] -> Process.put(:status, "approved") end)
    start_execution(:status_query)

    Arrivals.take("Open")
    publish()
    approval = Arrivals.promise("Approve")
    # await update Review -> (note): unsupported at the pin
    [approver] = Arrivals.await(approval)
    publish()

    complete_workflow_execution([
      %{request: request, approver: approver, note: nil, status: Process.get(:status)}
    ])
  end

  # The query handler is a parallel execution answering from the state the main one publishes.
  def status_query(_context, _input) do
    case await({:query_request, "Status"}) do
      {:ok, _} ->
        {true, status} = is_awaited({:info, :status})
        respond_query({:query, "Status"}, [:wait, answer: [status]])
        status_query(%{}, [])

      {:noevent, _} ->
        :ok
    end
  end

  defp publish, do: set_info(Process.get(:status), info_id: :status)
end
