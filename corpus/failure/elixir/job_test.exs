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
  defp await_first_task(we) do
    {:ok, %{history: %{events: events}}} =
      TemporalSdk.get_workflow_history(Corpus.Temporal.cluster(), we, await_all_close: false)

    unless Enum.any?(events, &(&1.event_type == :EVENT_TYPE_WORKFLOW_TASK_COMPLETED)) do
      Process.sleep(100)
      await_first_task(we)
    end
  end

  # The update case (update Attempt fails that update and the run goes on) is skipped: the SDK at
  # the pin has no update handling.
  test "await all fails the run with Reject's failure while Process still runs, never cancelled" do
    we = Corpus.Temporal.start_workflow(@tq, "Job", ["item-1"])
    await_first_task(we)
    TemporalSdk.signal_workflow(Corpus.Temporal.cluster(), we, "Proceed", input: [])

    assert {:ok, {:failed, %{failure: %{message: "rejected item-1", failure_info: {_, %{type: "Rejected"}}}}}} =
             TemporalSdk.await_workflow(Corpus.Temporal.cluster(), we, timeout: {60, :second})

    {:ok, history} = TemporalSdk.get_workflow_history(Corpus.Temporal.cluster(), we)
    types = Enum.map(history, & &1.event_type)
    assert List.last(types) == :EVENT_TYPE_WORKFLOW_EXECUTION_FAILED
    # The closed history holds Reject's failure and no close of Process: the run failed first.
    assert :EVENT_TYPE_ACTIVITY_TASK_FAILED in types
    refute :EVENT_TYPE_ACTIVITY_TASK_COMPLETED in types
    refute :EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED in types
  end
end
