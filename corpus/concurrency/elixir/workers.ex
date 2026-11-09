defmodule Concurrency.Workers do
  @moduledoc """
  Each .twf worker's types and start, shared by the worker process and the tests. The tests run
  in the dev server's only namespace, "default", not the design's `batches`.
  """

  @cluster :cluster_1

  def batch_types_workflows,
    do: %{"Batch" => Concurrency.Batch, "Audit" => Concurrency.Audit, "Archive" => Concurrency.Archive}

  def batch_types_activities, do: %{"Count" => Concurrency.Count, "Store" => Concurrency.Store}

  def start_batch_types(task_queue \\ "batches") do
    {:ok, _} = start(:workflow, task_queue, batch_types_workflows())
    {:ok, _} = start(:activity, task_queue, batch_types_activities())
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
