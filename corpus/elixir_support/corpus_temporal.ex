defmodule Corpus.Temporal do
  @moduledoc "One SDK cluster against a dev server, and the test helpers each design shares."

  @cluster :cluster_1

  def cluster, do: @cluster

  @doc "Starts the SDK with one cluster pointing at TEMPORAL_ADDRESS (default 127.0.0.1:7233)."
  def start do
    [host, port] = String.split(System.get_env("TEMPORAL_ADDRESS", "127.0.0.1:7233"), ":")
    {:ok, ip} = :inet.getaddr(String.to_charlist(host), :inet)

    Application.put_env(:temporal_sdk, :clusters,
      cluster_1: [
        client: %{
          adapter: {:temporal_sdk_grpc_adapter_gun_pool, [endpoints: [{ip, String.to_integer(port)}]]}
        }
      ]
    )

    {:ok, _} = Application.ensure_all_started(:temporal_sdk)
    :ok
  end

  @doc "Starts a test-only worker, such as a fixture's; `names` maps each .twf name to its module."
  def start_worker(type, id, task_queue, names, opts \\ []) do
    to_module = fn _cluster, name ->
      case Map.fetch(names, to_string(name)) do
        {:ok, mod} -> {:ok, mod}
        :error -> {:error, {"not registered", %{name: name}}}
      end
    end

    :temporal_sdk_worker.start(
      @cluster,
      type,
      [
        worker_id: id,
        task_queue: task_queue,
        allowed_temporal_names: Map.keys(names),
        temporal_name_to_erlang: to_module
      ] ++ opts
    )
  end

  def stop_worker(type, id), do: :temporal_sdk_worker.terminate(@cluster, type, id)

  @doc "Starts a workflow under a fresh ID and returns its execution."
  def start_workflow(task_queue, type, input, opts \\ []) do
    id = "#{type}-#{System.unique_integer([:positive])}-#{System.os_time(:millisecond)}"

    {:ok, %{workflow_execution: we}} =
      TemporalSdk.start_workflow(
        @cluster,
        task_queue,
        type,
        [input: input, workflow_id: id, opentelemetry: false] ++ opts
      )

    we
  end

  @doc """
  Replays a recorded history (`temporal workflow show --output json`) against `names`, which maps
  the workflow type, the file name's prefix before `--`, to its module.
  """
  def replay(file, names) do
    [type | _] = file |> Path.basename() |> String.split("--")
    :temporal_sdk.replay_file(@cluster, Map.fetch!(names, type), String.to_charlist(file))
  end

  @doc "Awaits a workflow's result, following its continue-as-new chain to the last run."
  def result(we) do
    case TemporalSdk.await_workflow(@cluster, we, timeout: {60, :second}) do
      {:ok, {:completed, %{result: [r]}}} -> r
      {:ok, {:continued_as_new, %{new_execution_run_id: run}}} -> result(%{we | run_id: run})
    end
  end
end
