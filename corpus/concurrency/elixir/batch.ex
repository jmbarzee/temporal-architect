defmodule Concurrency.Batch do
  @moduledoc "workflow Batch(items: list[string]) -> (Report)"
  use TemporalSdk.Workflow
  alias Corpus.Arrivals

  @impl true
  def execute(context, [items]) do
    Process.put(:status, "unacknowledged")
    Arrivals.on("Ack", fn [] -> Process.put(:status, "acknowledged") end)
    task_queue = context.worker_opts.task_queue
    wid = context.task.workflow_execution.workflow_id

    # await all: activity Count(items) -> count; workflow Audit(items) -> audited.
    count = start_activity("Count", [items])
    audit = start_child_workflow(task_queue, "Audit", input: [items], workflow_id: wid <> "/Audit")

    with [%{state: :completed, result: [n]}, %{state: :completed, result: [audited]}] <-
           wait_all([count, audit]) do
      # detach workflow Archive(items)
      case start_child_workflow(task_queue, "Archive",
             input: [items],
             workflow_id: wid <> "/Archive",
             parent_close_policy: :PARENT_CLOSE_POLICY_ABANDON,
             awaitable_event: :start,
             wait: true
           ) do
        %{state: :initiate_failed} ->
          fail_workflow_execution(%{message: "Archive did not start"})

        %{} ->
          # Never wait for the result; let the caller close while the child runs.
          await_open_before_close(false)
          t = start_timer({1, :hour})
          race(t)
          complete_workflow_execution([%{"count" => n, "audited" => audited, "status" => Process.get(:status)}])
      end
    else
      [c, a] -> fail_workflow_execution(%{message: "Count #{c.state}, Audit #{a.state}"})
    end
  end

  # Listed order: signal Ack, then the timer.
  defp race(t) do
    case Arrivals.first(ack: Arrivals.ready_at("Ack"), timer: Arrivals.timer_ready_at(t)) do
      :ack ->
        Arrivals.claim("Ack")
        # Cancelling a fired timer raises, so the losing inline timer is cancelled only if unfired.
        if Arrivals.timer_ready_at(t) == nil, do: cancel_timer(t)
        :ack

      :timer ->
        :timer

      nil ->
        await_any([{:signal_request, "Ack"}, t])
        race(t)
    end
  end
end

defmodule Concurrency.Audit do
  @moduledoc "workflow Audit(items: list[string]) -> (bool)"
  use TemporalSdk.Workflow

  @impl true
  def execute(_context, [items]), do: complete_workflow_execution([length(items) > 0])
end

defmodule Concurrency.Archive do
  @moduledoc "workflow Archive(items: list[string])"
  use TemporalSdk.Workflow

  @impl true
  def execute(_context, [items]) do
    with %{state: :completed} <- start_activity("Store", [items], wait: true) do
      complete_workflow_execution([])
    else
      %{state: state} -> fail_workflow_execution(%{message: "Store #{state}"})
    end
  end
end

defmodule Concurrency.Count do
  @moduledoc "activity Count(items: list[string]) -> (int)"
  use TemporalSdk.Activity

  @impl true
  def execute(_context, [items]), do: [length(items)]
end

defmodule Concurrency.Store do
  @moduledoc "activity Store(items: list[string])"
  use TemporalSdk.Activity

  @impl true
  def execute(_context, [_items]), do: []
end
