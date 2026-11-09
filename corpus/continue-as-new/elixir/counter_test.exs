defmodule ContinueAsNew.CounterTest do
  use ExUnit.Case, async: false

  @tq "counters-test"
  # The server skips each run's timer(1m), and each continued run inherits the setting.
  @skip [time_skipping_config: %{enabled: true}]

  setup_all do
    {:ok, _} = ContinueAsNew.Workers.start_counter_types(@tq, :counter_test)

    on_exit(fn ->
      Corpus.Temporal.stop_worker(:workflow, :counter_test)
      Corpus.Temporal.stop_worker(:activity, :counter_test)
    end)
  end

  test "Counter completes at the limit" do
    assert 3 == @tq |> Corpus.Temporal.start_workflow("Counter", [2, 3], @skip) |> Corpus.Temporal.result()
  end

  test "Counter continues as new below it" do
    first = Corpus.Temporal.start_workflow(@tq, "Counter", [0, 3], @skip)
    assert 3 == Corpus.Temporal.result(first)
    {:ok, h} = TemporalSdk.get_workflow_history(Corpus.Temporal.cluster(), first)
    assert List.last(h).event_type == :EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW
  end
end
