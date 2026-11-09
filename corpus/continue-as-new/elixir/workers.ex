defmodule ContinueAsNew.Workers do
  @moduledoc """
  Each .twf worker's types and start, shared by the worker process and the tests. The tests run
  in the dev server's only namespace, "default", not the design's `counters`.
  """

  @cluster :cluster_1

  def counter_types_workflows, do: %{"Counter" => ContinueAsNew.Counter}
  def counter_types_activities, do: %{"Increment" => ContinueAsNew.Increment}

  def start_counter_types(task_queue \\ "counters") do
    {:ok, _} = start(:workflow, task_queue, counter_types_workflows())
    {:ok, _} = start(:activity, task_queue, counter_types_activities())
  end

  defp start(type, task_queue, names) do
    TemporalSdk.Worker.start(@cluster, type,
      namespace: "default",
      task_queue: task_queue,
      temporal_name_to_erlang: fn _cluster, name ->
        case Map.fetch(names, to_string(name)) do
          {:ok, module} -> {:ok, module}
          :error -> {:error, {"not a .twf name of this worker", %{name: name}}}
        end
      end,
      allowed_temporal_names: Map.keys(names)
    )
  end
end
