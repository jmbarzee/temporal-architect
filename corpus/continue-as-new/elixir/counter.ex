defmodule ContinueAsNew.Counter do
  @moduledoc "workflow Counter(count: int, limit: int) -> (int)"
  use TemporalSdk.Workflow

  @impl true
  def execute(context, [count, limit]) do
    start_timer({1, :minute}, [:wait])
    %{result: [next]} = wait(start_activity("Increment", [count]))

    if next >= limit do
      complete_workflow_execution([next])
    else
      # The task queue is positional; the next run starts there with the new input.
      %{workflow_info: %{workflow_execution_task_queue: tq}} = context
      continue_as_new_workflow(tq, "Counter", input: [next, limit])
    end
  end
end

defmodule ContinueAsNew.Increment do
  @moduledoc "activity Increment(count: int) -> (int)"
  use TemporalSdk.Activity

  @impl true
  def execute(_context, [count]), do: [count + 1]
end
