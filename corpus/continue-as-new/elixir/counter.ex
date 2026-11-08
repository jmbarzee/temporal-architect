defmodule ContinueAsNew.Counter do
  @moduledoc "workflow Counter(count: int, limit: int) -> (int)"
  use TemporalSdk.Workflow

  @impl true
  def execute(context, [count, limit]) do
    start_timer({1, :minute}, [:wait])

    # A closed activity returns its state, never raises; any state but completed fails the run.
    case wait(start_activity("Increment", [count])) do
      %{state: :completed, result: [next]} when next >= limit ->
        complete_workflow_execution([next])

      %{state: :completed, result: [next]} ->
        # The task queue is positional (not context.workflow_info: on a sticky task it holds only
        # the attempt); the next run starts there with the new input.
        %{worker_opts: %{task_queue: tq}} = context
        continue_as_new_workflow(tq, "Counter", input: [next, limit])

      %{state: state} ->
        fail_workflow_execution(message: "Increment #{state}")
    end
  end
end

defmodule ContinueAsNew.Increment do
  @moduledoc "activity Increment(count: int) -> (int)"
  use TemporalSdk.Activity

  @impl true
  def execute(_context, [count]), do: [count + 1]
end
