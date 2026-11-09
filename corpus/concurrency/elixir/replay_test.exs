defmodule Concurrency.ReplayTest do
  use ExUnit.Case, async: false

  @names Map.put(Concurrency.Workers.workflows(), "AwaitOneTie", Concurrency.AwaitOneTie)

  for file <- Path.wildcard(Path.join(__DIR__, "histories/*.json")) do
    test "replays #{Path.basename(file)}" do
      assert {:ok, _} = Corpus.Temporal.replay(unquote(file), @names)
    end
  end
end
