defmodule Concurrency.Workers do
  @moduledoc "worker batchTypes: workflows Batch, Audit, Archive; activities Count, Store."

  def workflows,
    do: %{"Batch" => Concurrency.Batch, "Audit" => Concurrency.Audit, "Archive" => Concurrency.Archive}

  def activities, do: %{"Count" => Concurrency.Count, "Store" => Concurrency.Store}

  def start_batch_types(task_queue \\ "batches", id \\ :batch_types) do
    {:ok, _} = Corpus.Temporal.start_worker(:workflow, id, task_queue, workflows())
    Corpus.Temporal.start_worker(:activity, id, task_queue, activities())
  end
end
