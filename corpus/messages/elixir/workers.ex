defmodule Messages.Workers do
  @moduledoc """
  worker approvalTypes: the `.twf` names each worker serves and the modules behind them. An Elixir
  module's own name (`Elixir.Messages.Approval`) is its default Temporal type, so every worker maps
  the `.twf` name with `temporal_name_to_erlang` and allows only these names.
  """

  def approval_types, do: %{"Approval" => Messages.Approval}

  def start_approval_types(task_queue \\ "approvals", id \\ :approval_types),
    do: Corpus.Temporal.start_worker(:workflow, id, task_queue, approval_types())
end
