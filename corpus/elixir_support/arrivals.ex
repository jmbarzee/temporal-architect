defmodule Corpus.Arrivals do
  @moduledoc """
  A signal's pending arrivals and the waiters for them, kept in the calling workflow execution.

  The SDK keeps one index entry per signal name: a later arrival overwrites the entry and the
  earlier ones survive only in its `history` list, and `{:signal, name}` stays ready forever.
  So arrivals are read from that entry by event id, each runs its handler once, and the index is
  admitted so `{:signal_request, name}` blocks until the next one.

  Every waiter of a name lives in one execution (the main one): a promise takes a ticket at its
  binding and gets arrivals in ticket order; an `await one` case peeks and claims only if it wins.
  """
  alias TemporalSdk.Workflow, as: W

  @doc "Registers a name and its handler body (run once per arrival, in history order)."
  def on(name, handler \\ fn _args -> :ok end) do
    Process.put({__MODULE__, name}, %{
      handler: handler,
      seen: 0,
      pending: [],
      tickets: [],
      resolved: %{},
      next: 0
    })

    keep_open()
  end

  # The SDK's await returns :noevent at once when the run has no open Temporal task (a signal is
  # not one), so a run that may wait on signals alone holds one long timer open, and must not wait
  # for it at close.
  defp keep_open do
    unless Process.get({__MODULE__, :keep_open}) do
      W.start_timer({3650, :day}, timer_id: "arrivals-keep-open")
      W.await_open_before_close(false)
      Process.put({__MODULE__, :keep_open}, true)
    end

    :ok
  end

  @doc "`promise p <- signal X`: the ticket is taken now, so the promise begins waiting at its binding."
  def promise(name) do
    sync(name)
    st = get(name)
    t = st.next
    put(name, assign(%{st | next: t + 1, tickets: st.tickets ++ [t]}))
    {name, t}
  end

  @doc "`await signal X`: a promise awaited at once."
  def take(name), do: name |> promise() |> await()

  @doc "`await p`: waits until the arrival given to the promise's ticket."
  def await({name, t} = p) do
    sync(name)

    case get(name).resolved do
      %{^t => args} ->
        st = get(name)
        put(name, %{st | resolved: Map.delete(st.resolved, t)})
        args

      %{} ->
        W.await({:signal_request, name})
        await(p)
    end
  end

  @doc """
  For an `await one` signal case: the workflow task in which its oldest pending arrival became
  visible (see `task_of/1`), or nil when none is pending (no earlier waiter is owed one).
  """
  def ready_at(name) do
    sync(name)

    case get(name).pending do
      [{eid, _args} | _] -> task_of(eid)
      [] -> nil
    end
  end

  @doc "Takes the oldest pending arrival for the `await one` signal case that won."
  def claim(name) do
    st = get(name)
    [{_eid, args} | rest] = st.pending
    put(name, %{st | pending: rest})
    args
  end

  @doc "Reads arrivals not seen yet, runs their handlers, queues them, and admits the index."
  def sync(name) do
    st = get(name)

    case W.is_awaited({:signal, name}) do
      {true, data} ->
        new =
          [data | Map.get(data, :history, [])]
          |> Enum.filter(&(&1.event_id > st.seen))
          |> Enum.sort_by(& &1.event_id)

        Enum.each(new, fn a ->
          Process.put({__MODULE__, :arrival}, a.event_id)
          st.handler.(a.input)
        end)

        Process.delete({__MODULE__, :arrival})
        seen = Enum.reduce(new, st.seen, &max(&1.event_id, &2))
        put(name, assign(%{st | seen: seen, pending: st.pending ++ Enum.map(new, &{&1.event_id, &1.input})}))
        if data.state == :requested, do: W.admit_signal(name, [:wait])

      {false, _} ->
        :ok
    end

    :ok
  end

  @doc """
  The workflow task that first saw history event `eid`: the first WorkflowTaskStarted after it.
  Replay applies history up to the next commanded event, not task by task, so a run that resumed
  with no command can see later events on replay than it did live. An `await one` decided by
  "which case became ready in the earliest task, then the first listed" sees the same as live.
  """
  def task_of(eid) do
    spec = [{{:"$1", :EVENT_TYPE_WORKFLOW_TASK_STARTED, :_, :_}, [{:>, :"$1", eid}], [:"$1"]}]

    case W.select_history(spec) do
      [] -> :infinity
      ids -> Enum.min(ids)
    end
  end

  @doc """
  In a handler body, the workflow task of the arrival it handles (see `task_of/1`). A body that
  sets a condition records it, so an `await one` condition case ranks by the setting arrival.
  """
  def arrival_task, do: task_of(Process.get({__MODULE__, :arrival}))

  @doc "For an `await one` timer case: the task in which it fired, or nil."
  def timer_ready_at(t) do
    case W.is_awaited(t) do
      {true, %{state: :fired, event_id: eid}} -> task_of(eid)
      _ -> nil
    end
  end

  @doc """
  The winning case of an `await one`: `cases` is `[{key, ready_at}]` in listed order; the case
  ready in the earliest task wins, and the first listed among those. nil when none is ready.
  """
  def first(cases) do
    ready = for {k, at} <- cases, at != nil, do: {k, at}

    case ready do
      [] -> nil
      _ -> ready |> Enum.min_by(fn {_k, at} -> at end) |> elem(0)
    end
  end

  # Gives pending arrivals to tickets, oldest to the earliest.
  defp assign(%{pending: [a | ps], tickets: [t | ts]} = st),
    do: assign(%{st | pending: ps, tickets: ts, resolved: Map.put(st.resolved, t, elem(a, 1))})

  defp assign(st), do: st

  defp get(name), do: Process.get({__MODULE__, name})
  defp put(name, st), do: Process.put({__MODULE__, name}, st)
end
