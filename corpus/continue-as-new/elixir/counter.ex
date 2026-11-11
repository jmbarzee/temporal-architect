defmodule ContinueAsNew.Counter do
  @moduledoc "workflow Counter(count: int, limit: int) -> (int)"
  use TemporalSdk.Workflow

  @impl true
  def execute(context, [count, limit]) do
    start_timer({1, :minute}, [:wait])

    case start_activity("Increment", [count], wait: true) do
      %{state: :completed, result: [next]} when next >= limit ->
        complete_workflow_execution([next])

      %{state: :completed, result: [next]} ->
        continue_as_new_workflow(context.worker_opts.task_queue, "Counter", input: [next, limit])

      %{state: state} ->
        fail_workflow_execution(%{message: ~c"Increment #{state}"})
    end
  end
end

defmodule ContinueAsNew.Increment do
  @moduledoc "activity Increment(count: int) -> (int)"
  use TemporalSdk.Activity

  @impl true
  def execute(_context, [count]), do: [count + 1]
end
