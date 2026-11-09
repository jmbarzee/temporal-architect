defmodule ContinueAsNew.ReplayTest do
  use ExUnit.Case, async: false

  for file <- Path.wildcard(Path.join(__DIR__, "histories/*.json")) do
    test "replays #{Path.basename(file)}" do
      assert {:ok, _} = Corpus.Temporal.replay(unquote(file), ContinueAsNew.Workers.counter_types_workflows())
    end
  end
end
