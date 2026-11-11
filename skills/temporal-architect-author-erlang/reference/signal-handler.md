# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```erlang
execute(_Context, [_OrderId]) ->
    put(status, ~""),
    corpus_arrivals:on(~"PaymentReceived", fun([TransactionId, _Amount]) ->
        put(status, ~"payment_received"),
        put(last_transaction_id, TransactionId)
    end),
    %% ... the rest of the workflow
    ok.
```

There is no handler callback: a signal is an awaitable keyed by its name, whose index entry keeps only the latest arrival. Why, and what `Arrivals` does about it: [author-elixir signal-handler.md](../../temporal-architect-author-elixir/reference/signal-handler.md). The Erlang port is [`corpus/erlang_support/corpus_arrivals.erl`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/erlang_support/corpus_arrivals.erl): copy it into the project, renaming the module with the project's prefix, since every module of a rebar3 app is global ([SKILL.md](../SKILL.md#orient)). The refs spell it `corpus_arrivals`.

- `corpus_arrivals:on(~"Name", Body)` registers the signal at the start of `execute/2`, before the first wait. The name is the `.twf` name as a binary.
- **The body runs when the main execution syncs the name**: on every `corpus_arrivals` call for it, or `corpus_arrivals:sync(~"Name")`. Each arrival runs it once, in history order. Sync then calls `admit_signal(Name, [wait])`, so `{signal_request, Name}` blocks until the next arrival (`temporal_sdk/temporal_sdk_workflow.erl:2318-2337`).
- **A failure nothing routes fails the run** (spec 06): a body is main-execution code, so it closes a call's non-`completed` state with `fail_workflow_execution/1`, as the workflow body does ([activity-call.md](./activity-call.md)). A raise would fail only the workflow task ([author-elixir signal-handler.md](../../temporal-architect-author-elixir/reference/signal-handler.md)).
- **Every waiter of a name lives in the main execution**, one execution per name: a `start_execution` runs in its own process, with its own process dictionary (`executor/temporal_sdk_executor_workflow.erl:2182-2195`). State goes in the main execution's process dictionary, `put/2` and `get/1`, and a query reads it through `set_info` ([query-handler.md](./query-handler.md)).
- **`on` holds a keep-open timer**: the first `on` starts a ten-year timer, `arrivals-keep-open`, and calls `await_open_before_close(false)` (`temporal_sdk/temporal_sdk_workflow.erl:2883-2884`), so `await` blocks instead of returning `noevent` and the timer never holds the close. It frees every open activity and child the same way, so wait for any the close needs.
- **Several params map positionally, one payload each**: the body is a fun over the arrival's payload list, `fun([TransactionId, Amount]) -> … end` (`temporal_sdk/temporal_sdk_workflow.erl:1224`). No params → `fun([]) -> … end`. `warnings_as_errors` rejects an unused binding, so an ignored param is `_Amount`.
- The default body, `corpus_arrivals:on(~"Name")`, ignores the arrival.

## Handler options

`unfinished_policy` and `description` are unsupported: a signal has no registration to carry them ([author-elixir § Handler options](../../temporal-architect-author-elixir/reference/signal-handler.md#handler-options)). Drop both.
