defmodule Concurrency.AwaitOneTie do
  @moduledoc """
  `await one` over Ack and timer(1s), listed with `first` ("Ack" or "timer") first, for the
  engineered tie. A "Go" signal opens a workflow task that sleeps 3.5 s; the timer fires and Ack
  arrives meanwhile, so the next task holds both, and the first listed must win.
  """
  use TemporalSdk.Workflow
  alias Corpus.Arrivals

  @impl true
  def execute(_context, [first]) do
    Arrivals.on("Go")
    Arrivals.on("Ack")
    t = start_timer(1_000)
    Arrivals.take("Go")
    # Holds this workflow task open; history appended meanwhile reaches the next task together.
    Process.sleep(3_500)
    cases = if first == "Ack", do: [:ack, :timer], else: [:timer, :ack]
    complete_workflow_execution([race(cases, t)])
  end

  defp race(cases, t) do
    case Arrivals.first(Enum.map(cases, &{&1, ready_at(&1, t)})) do
      :ack ->
        Arrivals.claim("Ack")
        # Cancelling a fired timer raises, so a losing timer is cancelled only if unfired.
        if Arrivals.timer_ready_at(t) == nil, do: cancel_timer(t)
        "Ack"

      :timer ->
        "timer"

      nil ->
        await_any([{:signal_request, "Ack"}, t])
        race(cases, t)
    end
  end

  defp ready_at(:ack, _t), do: Arrivals.ready_at("Ack")
  defp ready_at(:timer, t), do: Arrivals.timer_ready_at(t)
end
