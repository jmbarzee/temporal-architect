defmodule Messages.Fixtures do
  @moduledoc "Workflows that pin spec 06's arrival rule, each receiving X \"1\" then X \"2\"."

  defmodule WaiterOrder do
    @moduledoc "Two promises bound in order, awaited in reverse: arrivals follow binding order."
    use TemporalSdk.Workflow
    alias Corpus.Arrivals

    @impl true
    def execute(_context, _input) do
      Arrivals.on("X")
      first = Arrivals.promise("X")
      second = Arrivals.promise("X")
      [b] = Arrivals.await(second)
      [a] = Arrivals.await(first)
      complete_workflow_execution([%{"began first" => a, "began second" => b}])
    end
  end

  defmodule PromiseThenAwait do
    @moduledoc "A promise bound before X \"1\" arrives gets it, though an await looks first."
    use TemporalSdk.Workflow
    alias Corpus.Arrivals

    @impl true
    def execute(_context, [timer_ms]) do
      Arrivals.on("X")
      p = Arrivals.promise("X")
      start_timer(timer_ms, [:wait])
      [awaited] = Arrivals.take("X")
      [promised] = Arrivals.await(p)
      complete_workflow_execution([%{"promise" => promised, "await" => awaited}])
    end
  end

  defmodule AwaitOne do
    @moduledoc "await one { signal X, timer(d) } then await signal X: a case takes only if it wins."
    use TemporalSdk.Workflow
    alias Corpus.Arrivals

    @impl true
    def execute(_context, [timer_ms]) do
      Arrivals.on("X")
      t = start_timer(timer_ms)
      first = race(t)
      [then] = Arrivals.take("X")
      complete_workflow_execution([[first, "then " <> then]])
    end

    # Listed order: signal X, then the timer. The losing inline timer is cancelled.
    defp race(t) do
      case Arrivals.first(x: Arrivals.ready_at("X"), timer: Arrivals.timer_ready_at(t)) do
        :x ->
          [v] = Arrivals.claim("X")
          if Arrivals.timer_ready_at(t) == nil, do: cancel_timer(t)
          "case " <> v

        :timer ->
          "timer"

        nil ->
          await_any([{:signal_request, "X"}, t])
          race(t)
      end
    end
  end

  defmodule Naive do
    @moduledoc """
    The naive mapping: wait on `{:signal, X}` per waiter. Both arrive before the first look, so
    the index holds only the latest arrival, and the second wait returns it again at once.
    """
    use TemporalSdk.Workflow

    @impl true
    def execute(_context, [timer_ms]) do
      start_timer(timer_ms, [:wait])
      %{input: [a]} = wait({:signal, "X"})
      %{input: [b]} = wait({:signal, "X"})
      complete_workflow_execution([[a, b]])
    end
  end
end
