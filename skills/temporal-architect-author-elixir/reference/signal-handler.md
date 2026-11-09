# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```elixir
@impl true
def execute(_context, [order_id]) do
  Process.put(:status, "")
  Arrivals.on("PaymentReceived", fn [transaction_id, _amount] ->
    Process.put(:status, "payment_received")
    Process.put(:last_transaction_id, transaction_id)
  end)
  # ... the rest of the workflow
end
```

There is no handler callback. A signal is an awaitable keyed by its name, `{:signal, "Name"}` (`temporal_sdk/temporal_sdk_workflow.erl:1208-1215`), in a `set` table (`executor/temporal_sdk_executor_workflow.erl:2687`): a later arrival overwrites the entry, and the earlier ones survive only in its `history` list (`api/awaitable/temporal_sdk_api_awaitable_index_table.erl:45-46,84-98`, `api/awaitable/temporal_sdk_api_awaitable_index.erl:863-868`). `{:signal, n}` then stays ready for good, and `{:signal_request, n}` stays ready until `admit_signal` (`api/awaitable/temporal_sdk_api_awaitable_index.erl:381-384`), so waiting on either loses arrivals. `Arrivals` turns that entry back into arrivals: copy [`corpus/elixir_support/arrivals.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/elixir_support/arrivals.ex) into the project, renaming `Corpus.Arrivals` into its namespace and aliasing it as `Arrivals`; [`corpus/messages/elixir/approval.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/elixir/approval.ex) is the worked example.

- `Arrivals.on(name, body)` registers the signal at the start of `execute/2`, before the first wait.
- **The body runs when the main execution syncs the name**: on every `Arrivals` call for it, or `Arrivals.sync(name)`. Each arrival runs it once, in history order. Sync before code that reads state a body writes. Sync reads the arrivals not yet seen, then `admit_signal(name, [:wait])` so that `{:signal_request, name}` blocks until the next one. `[:wait]` applies the admit before the next sync, since admitting twice is an invalid `admitted` → `admitted` transition, and the task fails as nondeterministic (`temporal_sdk/temporal_sdk_workflow.erl:2315-2337`, `api/awaitable/temporal_sdk_api_awaitable_index.erl:691-692,712`).
- **Every waiter of a name lives in the main execution.** A `start_execution` runs in its own process (`executor/temporal_sdk_executor_workflow.erl:2182-2195`), with its own process dictionary and its own wake-ups, so arrivals cannot be ordered across executions. State goes in the main execution's process dictionary, and a query reads it through `set_info` ([query-handler.md](./query-handler.md)).
- **`on` holds a keep-open timer.** With no open activity, timer or child, `await` returns `:noevent` at once instead of blocking (`executor/temporal_sdk_executor_workflow.erl:687-690`), and a signal is none of those. So the first `on` starts a ten-year timer and calls `await_open_before_close(false)` (`temporal_sdk/temporal_sdk_workflow.erl:2883-2884`), which keeps that timer from holding the close (`executor/temporal_sdk_executor_workflow.erl:1106-1110`). It does so for every open activity and child too, so wait for any the close needs. The cost is one `TimerStarted` per run.
- **Several params map positionally, one payload each**: the body takes the arrival's payload list, `fn [transaction_id, amount] -> … end` (`temporal_sdk/temporal_sdk_workflow.erl:1224`), and a sender passes `input: [transaction_id, amount]` ([signal-send.md](./signal-send.md)). No params → `fn [] -> … end`.
- The default body ignores the arrival, `fn _ -> :ok end`.

## Handler options

`unfinished_policy` and `description` are unsupported: a signal has no registration to carry them. It exists only as the awaitable's name, and `admit_signal`'s options are `details`, `awaitable_event` and `wait` (`temporal_sdk/temporal_sdk_workflow.erl:2318-2324`). Drop both.
