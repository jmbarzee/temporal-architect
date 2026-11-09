defmodule Messages.Workers do
  @moduledoc """
  Each .twf worker's types and start, shared by the worker process and the tests. The tests run
  in the dev server's only namespace, "default", not the design's `approvals`.
  """

  @cluster :cluster_1

  def approval_types_workflows, do: %{"Approval" => Messages.Approval}

  def start_approval_types(task_queue \\ "approvals") do
    {:ok, _} = start(:workflow, task_queue, approval_types_workflows())
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
