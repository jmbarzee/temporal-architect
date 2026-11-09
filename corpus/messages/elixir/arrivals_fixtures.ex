defmodule Messages.Fixtures do
  @moduledoc """
  Workflows that pin spec 06's arrival rule, each receiving X "1" then X "2", and a condition
  case of `await one`.
  """

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

  defmodule ConditionCase do
    @moduledoc """
    `signal Ready(on: bool)` sets or unsets the condition `ready`; after a hold, `await one`
    { timer(d), ready }. The condition case ranks by the task of the arrival that set it, so set
    before the timer fired it wins though listed second, and set then unset it is not ready.
    """
    use TemporalSdk.Workflow
    alias Corpus.Arrivals

    @impl true
    def execute(_context, [timer_ms, hold_ms]) do
      # condition ready: nil while unset, else the task of the arrival that set it.
      Process.put(:ready, nil)

      Arrivals.on("Ready", fn
        [true] -> Process.put(:ready, Process.get(:ready) || Arrivals.arrival_task())
        [false] -> Process.put(:ready, nil)
      end)

      t = start_timer(timer_ms)
      start_timer(hold_ms, [:wait])
      complete_workflow_execution([race(t)])
    end

    # Listed order: the timer, then the condition.
    defp race(t) do
      Arrivals.sync("Ready")

      case Arrivals.first(timer: Arrivals.timer_ready_at(t), ready: Process.get(:ready)) do
        :timer ->
          "timer"

        :ready ->
          if Arrivals.timer_ready_at(t) == nil, do: cancel_timer(t)
          "ready"

        nil ->
          await_any([{:signal_request, "Ready"}, t])
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
