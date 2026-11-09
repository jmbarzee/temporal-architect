defmodule Concurrency.Tie do
  @moduledoc """
  Sets up the `await one` tie: Go at 0.3 s opens a 3.5 s workflow task, and Ack is sent either at
  0.5 s (before the 1 s timer fires) or at 3 s (after it), so the next task holds both in the
  chosen history order. Timing can miss on a loaded runner, so each attempt runs on a fresh task
  queue and workflow ID, and a miss is returned, never asserted on.
  """
  import Corpus.Temporal, only: [start_workflow: 3, result: 1]

  @fired :EVENT_TYPE_TIMER_FIRED
  @signaled :EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED

  @doc "{:tie, winner, events} from the first attempt that lands, else {:missed, reasons}."
  def run(first, order, attempts), do: run(first, order, attempts, [])

  defp run(_first, _order, 0, misses), do: {:missed, Enum.reverse(misses)}

  defp run(first, order, left, misses) do
    tq = "tie-#{System.unique_integer([:positive])}"
    id = String.to_atom(tq)
    {:ok, _} = Corpus.Temporal.start_worker(:workflow, id, tq, %{"AwaitOneTie" => Concurrency.AwaitOneTie})

    try do
      we = start_workflow(tq, "AwaitOneTie", [first])
      Process.sleep(300)
      signal(we, "Go")
      Process.sleep(if order == [@signaled, @fired], do: 200, else: 2_700)
      signal(we, "Ack")
      winner = result(we)
      events = events(we)

      case tie_task(events) do
        ^order -> {:tie, winner, events}
        other -> run(first, order, left - 1, ["#{we.workflow_id}: #{inspect(other)}" | misses])
      end
    after
      Corpus.Temporal.stop_worker(:workflow, id)
    end
  end

  defp signal(we, name), do: TemporalSdk.signal_workflow(Corpus.Temporal.cluster(), we, name)

  defp events(we) do
    {:ok, h} = TemporalSdk.get_workflow_history(Corpus.Temporal.cluster(), we)
    Enum.map(h, & &1.event_type)
  end

  # The timer fire and Ack among the events between the Go task's completion and the next task.
  defp tie_task(events) do
    events
    |> Enum.drop_while(&(&1 != @signaled))
    |> Enum.drop_while(&(&1 != :EVENT_TYPE_WORKFLOW_TASK_COMPLETED))
    |> tl()
    |> Enum.take_while(&(&1 != :EVENT_TYPE_WORKFLOW_TASK_STARTED))
    |> Enum.filter(&(&1 in [@fired, @signaled]))
  end
end

defmodule Concurrency.AwaitOneTest do
  @moduledoc """
  `await one` is first-listed-wins: on a tie (one workflow task holding both the timer fire and
  Ack), in either history order, the case listed first wins. The ties are set up while this file
  loads, because ExUnit fixes a test's skip tag at definition: a tie that never lands in its
  attempts is reported as skipped, and its behaviour is never asserted.
  """
  use ExUnit.Case, async: false

  @fired :EVENT_TYPE_TIMER_FIRED
  @signaled :EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED

  for first <- ["Ack", "timer"], order <- [[@fired, @signaled], [@signaled, @fired]] do
    name = "tie: #{first} listed first, history #{inspect(order)}"

    case Concurrency.Tie.run(first, order, 3) do
      {:tie, winner, events} ->
        test name do
          assert unquote(winner) == unquote(first)
          # The timer fired, so the losing timer is never cancelled.
          refute :EVENT_TYPE_TIMER_CANCELED in unquote(events)
        end

      {:missed, misses} ->
        reason = "no one-task tie in #{length(misses)} attempts: #{Enum.join(misses, "; ")}"
        IO.warn("#{name}: #{reason}", [])
        @tag skip: reason
        test name, do: :ok
    end
  end
end
