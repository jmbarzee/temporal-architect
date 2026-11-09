defmodule Messages.MessagesTest do
  use ExUnit.Case, async: false
  import Corpus.Temporal, only: [start_workflow: 3, result: 1]

  @tq "messages-test"

  setup_all do
    names =
      Map.merge(Messages.Workers.approval_types(), %{
        "WaiterOrder" => Messages.Fixtures.WaiterOrder,
        "PromiseThenAwait" => Messages.Fixtures.PromiseThenAwait,
        "AwaitOne" => Messages.Fixtures.AwaitOne,
        "Naive" => Messages.Fixtures.Naive
      })

    {:ok, _} = Corpus.Temporal.start_worker(:workflow, :messages_test, @tq, names)
    on_exit(fn -> Corpus.Temporal.stop_worker(:workflow, :messages_test) end)
  end

  defp signal(we, name, args), do: TemporalSdk.signal_workflow(Corpus.Temporal.cluster(), we, name, input: args)

  # Sends X "1" at 2 s and X "2" at 4 s (the dev server's timers are not finer than that).
  defp with_two_xs(type, input) do
    we = start_workflow(@tq, type, input)
    Process.sleep(2_000)
    signal(we, "X", ["1"])
    Process.sleep(2_000)
    signal(we, "X", ["2"])
    result(we)
  end

  test "Approval: Open before any waiter, Approve to the promise; Status reads state" do
    we = start_workflow(@tq, "Approval", ["req-1"])
    signal(we, "Open", [])
    Process.sleep(1_500)
    assert {:ok, %{query_result: ["open"]}} = TemporalSdk.query_workflow(Corpus.Temporal.cluster(), we, "Status")
    signal(we, "Approve", ["ann"])

    assert %{"request" => "req-1", "approver" => "ann", "status" => "approved"} = result(we)
  end

  test "arrivals go to waiters in the order they began" do
    assert %{"began first" => "1", "began second" => "2"} = with_two_xs("WaiterOrder", [])
  end

  test "a promise begins waiting at its binding" do
    assert %{"promise" => "1", "await" => "2"} = with_two_xs("PromiseThenAwait", [3_000])
  end

  test "await one: the signal case wins and takes" do
    assert ["case 1", "then 2"] = with_two_xs("AwaitOne", [20_000])
  end

  test "await one: the timer wins and the case takes nothing" do
    assert ["timer", "then 1"] = with_two_xs("AwaitOne", [300])
  end

  test "naive: one wait per waiter reads the latest arrival twice" do
    assert ["2", "2"] = with_two_xs("Naive", [5_000])
  end
end
