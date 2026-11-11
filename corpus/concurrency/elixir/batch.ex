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

    case wait_branches([count, audit]) do
      {:failed, branch} ->
        await_open_before_close(false)
        fail_workflow_execution(failure(branch))

      {:ok, [%{result: [n]}, %{result: [audited]}]} ->
        # detach workflow Archive(items)
        case start_child_workflow(task_queue, "Archive",
               input: [items],
               workflow_id: wid <> "/Archive",
               parent_close_policy: :PARENT_CLOSE_POLICY_ABANDON,
               awaitable_event: :start,
               wait: true
             ) do
          %{state: :initiate_failed} ->
            fail_workflow_execution(%{message: ~c"Archive did not start"})

          %{} ->
            # Never wait for the result; let the caller close while the child runs.
            await_open_before_close(false)
            t = start_timer({1, :hour})
            race(t)
            complete_workflow_execution([%{"count" => n, "audited" => audited, "status" => Process.get(:status)}])
        end
    end
  end

  @failed [:failed, :timedout, :canceled, :terminated, :initiate_failed]

  # await all (skills/temporal-architect-author-elixir/reference/await-all.md): the branches' data
  # maps in listed order, or the first branch to fail, by workflow task then listed order.
  defp wait_branches(handles) do
    matches = Enum.map(handles, &is_awaited/1)
    failed = for {true, %{state: s, event_id: eid} = m} <- matches, s in @failed, do: {Arrivals.task_of(eid), m}

    cond do
      failed != [] -> {:failed, failed |> Enum.min_by(&elem(&1, 0)) |> elem(1)}
      Enum.all?(matches, &match?({true, _}, &1)) -> {:ok, Enum.map(matches, &elem(&1, 1))}
      true ->
        wait_any(for {h, {false, _}} <- Enum.zip(handles, matches), do: h)
        wait_branches(handles)
    end
  end

  # The branch's message, application type and details, the message as a charlist.
  defp failure(%{failure: f}) do
    info =
      case f do
        %{failure_info: {:application_failure_info, i}} -> Map.take(i, [:type, :details])
        %{} -> %{}
      end

    Map.put(info, :message, to_charlist(Map.get(f, :message, "")))
  end

  defp failure(%{state: state}), do: %{message: ~c"#{state}"}

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
      %{state: state} -> fail_workflow_execution(%{message: ~c"Store #{state}"})
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
