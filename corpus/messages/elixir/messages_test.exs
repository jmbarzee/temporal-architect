defmodule Messages.MessagesTest do
  use ExUnit.Case, async: false
  import Corpus.Temporal, only: [start_workflow: 3, result: 1]

  @tq "messages-test"
  @fixtures_tq "messages-fixtures-test"

  setup_all do
    {:ok, %{worker_id: id}} = Messages.Workers.start_approval_types(@tq)

    fixtures = %{
      "WaiterOrder" => Messages.Fixtures.WaiterOrder,
      "PromiseThenAwait" => Messages.Fixtures.PromiseThenAwait,
      "AwaitOne" => Messages.Fixtures.AwaitOne,
      "ConditionCase" => Messages.Fixtures.ConditionCase,
      "Naive" => Messages.Fixtures.Naive
    }

    {:ok, _} = Corpus.Temporal.start_worker(:workflow, :messages_fixtures, @fixtures_tq, fixtures)

    on_exit(fn ->
      Corpus.Temporal.stop_worker(:workflow, id)
      Corpus.Temporal.stop_worker(:workflow, :messages_fixtures)
    end)
  end

  defp signal(we, name, args), do: TemporalSdk.signal_workflow(Corpus.Temporal.cluster(), we, name, input: args)
  defp query(we), do: TemporalSdk.query_workflow(Corpus.Temporal.cluster(), we, "Status")

  # Sends `name` with each input in turn, 2 s apart from the start (the dev server's timers are
  # not finer than that).
  defp with_signals(type, input, name, inputs) do
    we = start_workflow(@fixtures_tq, type, input)

    for args <- inputs do
      Process.sleep(2_000)
      signal(we, name, args)
    end

    result(we)
  end

  defp with_two_xs(type, input), do: with_signals(type, input, "X", [["1"], ["2"]])

  test "Approval: Open before any waiter, Approve to the promise; Status reads state, open and closed" do
    we = start_workflow(@tq, "Approval", ["req-1"])
    signal(we, "Open", [])
    Process.sleep(1_500)
    assert {:ok, %{query_result: ["open"]}} = query(we)
    signal(we, "Approve", ["ann"])

    assert %{"request" => "req-1", "approver" => "ann", "status" => "approved"} = result(we)
    assert {:ok, %{query_result: ["approved"]}} = query(we)
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

  test "await one: a condition set before the timer fired wins, though listed second" do
    assert "ready" = with_signals("ConditionCase", [3_000, 6_000], "Ready", [[true]])
  end

  test "await one: a condition set, then unset, is not ready" do
    assert "timer" = with_signals("ConditionCase", [3_000, 6_000], "Ready", [[true], [false]])
  end

  test "naive: one wait per waiter reads the latest arrival twice" do
    assert ["2", "2"] = with_two_xs("Naive", [5_000])
  end
end
