# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```rust
#[workflow]
pub struct OrderWorkflow {
    status: String,
    last_transaction_id: String,
    payments_received: Arrivals<(String, Decimal)>, // only if the design waits on it
}

#[workflow_methods]
impl OrderWorkflow {
    #[signal(name = "PaymentReceived")]
    pub fn payment_received(
        &mut self,
        _ctx: &mut SyncWorkflowContext<Self>,
        MultiArgs2(transaction_id, amount): MultiArgs2<String, Decimal>,
    ) {
        self.status = "payment_received".into();
        self.last_transaction_id = transaction_id.clone();
        self.payments_received.add((transaction_id, amount));
    }
    // ... #[init], #[run]
}
```

- A sync `#[signal]` method takes `&mut self` and a `&mut SyncWorkflowContext<Self>` (`crates/macros/src/workflow_definitions.rs:352-371,449-466`), always with `name =` (the SKILL's Wire names); senders: [signal-send.md](./signal-send.md). It takes one input after the context (`:509-525`): no params → none; one → its type; several → `temporalio_common::data_converters::MultiArgsN`, positional, one payload each (`crates/common-wasm/src/data_converters.rs:822-877`), which the handler's decode reads through `from_payloads` (`crates/macros/src/workflow_definitions.rs:85`).
- The body runs as the signal's job is applied, every arrival, whether or not anything waits (`crates/workflow/src/runtime/instance.rs:563-567,1079-1130`); it then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)). A body that awaits (a timer, an activity) needs the async form, `pub async fn x(ctx: &mut WorkflowContext<Self>, …)`, which mutates through `ctx.state_mut` (`crates/sdk/README.md:192-199`) and adds after its last await: the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.
- **A failure nothing routes fails the run** (spec 06), but a signal body returns nothing (`crates/workflow/src/runtime/entry.rs:147,165`). So an async body keeps the failure in a state field, `failure: Option<WorkflowTermination>`, and the run races each wait against `ctx.wait_condition(|s| s.failure.is_some())` in a `select!` and returns it. A `panic!` would fail only the workflow task, which the server retries (`crates/sdk/src/workflow_future.rs:678-693`).
- Handler options are unsupported in Rust: the attribute accepts only `name` (`crates/macros/src/workflow_definitions.rs:270-290`), so `unfinished_policy` and `description` have no Rust form.
