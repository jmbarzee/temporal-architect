defmodule Concurrency.Batch do
  @moduledoc "workflow Batch(items: list[string]) -> (Report)"
  use TemporalSdk.Workflow
  alias Corpus.Arrivals

  @impl true
  def execute(context, [items]) do
    Process.put(:status, "unacknowledged")
    Arrivals.on("Ack", fn _ -> Process.put(:status, "acknowledged") end)
    # Not context.workflow_info: on a sticky task it holds only the attempt.
    %{worker_opts: %{task_queue: tq}, task: %{workflow_execution: %{workflow_id: wid}}} = context

    # await all: activity Count(items) -> count; workflow Audit(items) -> audited.
    # A closed activity or child returns its state, never raises; a failed match would raise into
    # a retried workflow-task failure, so any state but completed closes the run as failed.
    count = start_activity("Count", [items])
    audit = start_child_workflow(tq, "Audit", input: [items], workflow_id: wid <> "/audit")

    case wait_all([count, audit]) do
      [%{state: :completed, result: [n]}, %{state: :completed, result: [audited]}] ->
        case detach_archive(tq, wid, items) do
          %{state: :initiate_failed} -> fail_workflow_execution(message: "Archive did not start")
          _ -> acknowledge(n, audited)
        end

      [c, a] ->
        fail_workflow_execution(message: "Count #{c.state}, Audit #{a.state}")
    end
  end

  # detach workflow Archive(items): wait for its start, never its result; ABANDON at parent close.
  # A start already followed by the child's close reports that state, so only initiate_failed
  # means Archive never started.
  defp detach_archive(tq, wid, items) do
    start_child_workflow(tq, "Archive",
      input: [items],
      workflow_id: wid <> "/archive",
      parent_close_policy: :PARENT_CLOSE_POLICY_ABANDON,
      awaitable_event: :start,
      wait: true
    )
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
    case wait(start_activity("Store", [items])) do
      %{state: :completed} -> complete_workflow_execution([])
      %{state: state} -> fail_workflow_execution(message: "Store #{state}")
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
