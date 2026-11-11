defmodule Failure.Job do
  @moduledoc """
  workflow Job(item: string).
  `update Attempt` is not mapped: the SDK at d2749c7 has no update handling (TODO.md:3).
  """
  use TemporalSdk.Workflow
  alias Corpus.Arrivals

  # A branch in one of these states has failed; any other ready state is done.
  @failed [:failed, :timedout, :canceled, :terminated, :initiate_failed]

  @impl true
  def execute(_context, [item]) do
    Process.put(:proceeding, nil)
    Arrivals.on("Proceed", fn [] -> Process.put(:proceeding, Process.get(:proceeding) || Arrivals.arrival_task()) end)

    await_condition(["Proceed"], fn -> Process.get(:proceeding) != nil end)

    # await all: activity Reject(item); activity Process(item).
    reject = start_activity("Reject", [item], Failure.Reject.defaults())
    process = start_activity("Process", [item])

    case wait_branches([reject, process]) do
      {:ok, _results} ->
        complete_workflow_execution([])

      {:failed, branch} ->
        # The close would otherwise wait for every open activity, Process included.
        await_open_before_close(false)
        fail_workflow_execution(failure(branch))
    end
  end

  # The branches' data maps in listed order, or the first branch to fail: the one that failed in
  # the earliest workflow task, the first listed among those. The others keep running.
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

  # The run fails with the branch's failure: its message, application type and details. The
  # message goes as a charlist, since the default serializer prints any other term.
  defp failure(%{failure: f}) do
    info =
      case f do
        %{failure_info: {:application_failure_info, i}} -> Map.take(i, [:type, :details])
        %{} -> %{}
      end

    Map.put(info, :message, to_charlist(Map.get(f, :message, "")))
  end

  defp failure(%{state: state}), do: %{message: ~c"#{state}"}

  # Waits until cond holds; only the bodies of signals in names can set it.
  defp await_condition(names, cond) do
    Enum.each(names, &Arrivals.sync/1)

    unless cond.() do
      await_any(Enum.map(names, &{:signal_request, &1}))
      await_condition(names, cond)
    end
  end
end

defmodule Failure.Reject do
  @moduledoc "activity Reject(item: string)"
  use TemporalSdk.Activity

  def defaults, do: [retry_policy: %{maximum_attempts: 1}]

  @impl true
  def execute(_context, [item]), do: fail(%{message: ~c"rejected #{item}", type: "Rejected"})
end

# Nested under Failure: a bare Process would shadow Elixir's own.
defmodule Failure.Process do
  @moduledoc "activity Process(item: string)"
  use TemporalSdk.Activity

  # Long enough that the run fails while it still runs.
  @impl true
  def execute(_context, [_item]) do
    Process.sleep(5_000)
    []
  end
end
