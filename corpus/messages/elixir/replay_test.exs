defmodule Messages.ReplayTest do
  use ExUnit.Case, async: false

  @names Map.merge(Messages.Workers.approval_types_workflows(), %{
           "WaiterOrder" => Messages.Fixtures.WaiterOrder,
           "PromiseThenAwait" => Messages.Fixtures.PromiseThenAwait,
           "AwaitOne" => Messages.Fixtures.AwaitOne,
           "ConditionCase" => Messages.Fixtures.ConditionCase,
           "Naive" => Messages.Fixtures.Naive
         })

  for file <- Path.wildcard(Path.join(__DIR__, "histories/*.json")) do
    test "replays #{Path.basename(file)}" do
      assert {:ok, _} = Corpus.Temporal.replay(unquote(file), @names)
    end
  end
end
