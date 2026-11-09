defmodule Concurrency.BatchTest do
  use ExUnit.Case, async: false
  import Corpus.Temporal, only: [start_workflow: 3, start_workflow: 4, result: 1]

  @tq "batches-test"

  setup_all do
    {:ok, _} = Concurrency.Workers.start_batch_types(@tq, :batch_test)

    on_exit(fn ->
      Corpus.Temporal.stop_worker(:workflow, :batch_test)
      Corpus.Temporal.stop_worker(:activity, :batch_test)
    end)
  end

  defp events(we) do
    {:ok, h} = TemporalSdk.get_workflow_history(Corpus.Temporal.cluster(), we)
    Enum.map(h, & &1.event_type)
  end

  test "Batch acknowledged, cancelling the unfired timer" do
    we = start_workflow(@tq, "Batch", [["a", "b"]])
    Process.sleep(1_500)
    TemporalSdk.signal_workflow(Corpus.Temporal.cluster(), we, "Ack")
    assert %{"count" => 2, "audited" => true, "status" => "acknowledged"} = result(we)
    assert :EVENT_TYPE_TIMER_CANCELED in events(we)
  end

  test "Batch timed out, its detached Archive abandoned at close" do
    # The server skips timer(1h). Skipping waits for in-flight work, Archive's included, so
    # Archive cannot be seen outliving Batch here; its ABANDON policy is read from history.
    we = start_workflow(@tq, "Batch", [["a"]], time_skipping_config: %{enabled: true})
    assert %{"count" => 1, "audited" => true, "status" => "unacknowledged"} = result(we)
    {:ok, h} = TemporalSdk.get_workflow_history(Corpus.Temporal.cluster(), we)

    policies =
      for %{attributes: {:start_child_workflow_execution_initiated_event_attributes, a}} <- h,
          do: {a.workflow_type.name, a.parent_close_policy}

    assert {"Archive", :PARENT_CLOSE_POLICY_ABANDON} in policies
  end
end
