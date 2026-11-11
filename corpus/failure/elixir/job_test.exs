defmodule Failure.JobTest do
  use ExUnit.Case, async: false

  @tq "failure-test"

  setup_all do
    # The workflow and activity workers share the default worker ID, built from the queue.
    {:ok, %{worker_id: id}} = Failure.Workers.start_job_types(@tq)

    on_exit(fn ->
      Corpus.Temporal.stop_worker(:workflow, id)
      Corpus.Temporal.stop_worker(:activity, id)
    end)
  end

  # A signal ahead of the first workflow task records a history the SDK cannot replay at the pin
  # (#524's upstream draft 1), so the test signals only once that task completed.
  defp await_first_task(we, tries \\ 50) do
    {:ok, %{history: %{events: events}}} =
      TemporalSdk.get_workflow_history(Corpus.Temporal.cluster(), we, await_all_close: false)

    unless Enum.any?(events, &(&1.event_type == :EVENT_TYPE_WORKFLOW_TASK_COMPLETED)) do
      assert tries > 0, "the first workflow task never completed"
      Process.sleep(100)
      await_first_task(we, tries - 1)
    end
  end

  # The update case (update Attempt fails that update and the run goes on) is skipped: the SDK at
  # the pin has no update handling.
  test "await all fails the run with Reject's failure while Process still runs, never cancelled" do
    we = Corpus.Temporal.start_workflow(@tq, "Job", ["item-1"])
    await_first_task(we)
    TemporalSdk.signal_workflow(Corpus.Temporal.cluster(), we, "Proceed", input: [])

    # Bounded: a wait-for-all run would fail only after Process's 5 s, with its completion recorded.
    assert {:ok, {:failed, %{failure: %{message: "rejected item-1", failure_info: {_, %{type: "Rejected"}}}}}} =
             TemporalSdk.await_workflow(Corpus.Temporal.cluster(), we, timeout: {30, :second})

    {:ok, history} = TemporalSdk.get_workflow_history(Corpus.Temporal.cluster(), we)
    types = Enum.map(history, & &1.event_type)
    assert List.last(types) == :EVENT_TYPE_WORKFLOW_EXECUTION_FAILED

    # Process was scheduled before Reject failed, so the branches ran together, not in turn.
    process_scheduled =
      Enum.find_index(history, &match?(%{attributes: {_, %{activity_type: %{name: "Process"}}}}, &1))

    assert process_scheduled, "Process was not scheduled"
    assert process_scheduled < Enum.find_index(types, &(&1 == :EVENT_TYPE_ACTIVITY_TASK_FAILED))

    # The closed history holds no close of Process, and no cancel request: the run failed first.
    refute :EVENT_TYPE_ACTIVITY_TASK_COMPLETED in types
    refute :EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED in types
  end
end
