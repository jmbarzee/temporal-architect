defmodule Concurrency.Batch do
  @moduledoc "workflow Batch(items: list[string]) -> (Report)"
  use TemporalSdk.Workflow
  alias Corpus.Arrivals

  @impl true
  def execute(context, [items]) do
    Process.put(:status, "unacknowledged")
    Arrivals.on("Ack", fn _ -> Process.put(:status, "acknowledged") end)
    %{workflow_info: %{workflow_execution_task_queue: tq, workflow_execution: %{workflow_id: wid}}} = context

    # await all: activity Count(items) -> count; workflow Audit(items) -> audited
    count = start_activity("Count", [items])
    audit = start_child_workflow(tq, "Audit", input: [items], workflow_id: wid <> "/audit")
    [%{result: [n]}, %{result: [audited]}] = wait_all([count, audit])

    # detach workflow Archive(items): wait for its start, never its result; ABANDON at parent close
    archive =
      start_child_workflow(tq, "Archive",
        input: [items],
        workflow_id: wid <> "/archive",
        parent_close_policy: :PARENT_CLOSE_POLICY_ABANDON,
        awaitable_event: :start,
        wait: true
      )

    # A failed match would raise, which the SDK retries as a workflow-task failure; close instead.
    case archive do
      %{state: :started} -> acknowledge(n, audited)
      %{state: state} -> fail_workflow_execution(message: "Archive did not start: #{state}")
    end
  end

  defp acknowledge(n, audited) do
    await_open_before_close(false)

    # await one: signal Ack, timer(1h). Listed order decides a tie; the losing inline timer is cancelled.
    t = start_timer({1, :hour})
    race(t)

    complete_workflow_execution([%{count: n, audited: audited, status: Process.get(:status)}])
  end

  defp race(t) do
    case Arrivals.first(ack: Arrivals.ready_at("Ack"), timer: Arrivals.timer_ready_at(t)) do
      :ack ->
        Arrivals.claim("Ack")
        if Arrivals.timer_ready_at(t) == nil, do: cancel_timer(t)

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
    wait(start_activity("Store", [items]))
    complete_workflow_execution([])
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
