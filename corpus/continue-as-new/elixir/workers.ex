defmodule ContinueAsNew.Workers do
  @moduledoc "worker counterTypes: workflow Counter; activity Increment."

  def workflows, do: %{"Counter" => ContinueAsNew.Counter}
  def activities, do: %{"Increment" => ContinueAsNew.Increment}

  def start_counter_types(task_queue \\ "counters", id \\ :counter_types) do
    {:ok, _} = Corpus.Temporal.start_worker(:workflow, id, task_queue, workflows())
    Corpus.Temporal.start_worker(:activity, id, task_queue, activities())
  end
end
