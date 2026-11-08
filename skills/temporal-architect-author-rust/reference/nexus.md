# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```rust
// Preview: the Nexus caller needs temporalio-sdk's `experimental` feature.
let pc = ctx.payload_converter().clone();
let options = NexusOperationOptions::builder()
    .endpoint("BillingEndpoint")
    .service("BillingService")
    .operation("ChargePayment")
    .input(RawValue::from_value(&order.payment, &pc).payloads.remove(0))
    .build();
let started = ctx
    .start_nexus_operation(options)
    .await
    .map_err(|f| ApplicationFailure::new(f.message))?;
let payment_result: PaymentResult = match started.result().await.status {
    Some(Status::Completed(p)) => RawValue::new(vec![p]).to_value(&pc),
    other => return Err(ApplicationFailure::new(format!("ChargePayment: {other:?}")).into()),
};
```

- The caller is untyped: `NexusOperationOptions` carries the endpoint, service and operation as the `.twf` names in strings (`workflow/src/workflow_context/options/nexus.rs:59-69`), and its `input` is one `Payload` (`:70-74`), so an operation takes one input by construction. Encode it with the workflow's converter, `ctx.payload_converter()` (`workflow/src/workflow_context.rs:2332-2335`). A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, still sends `"OrderService"`: a package only qualifies `.twf` names.
- `ctx.start_nexus_operation(options)` (`workflow/src/workflow_context/nexus.rs:76-83`) resolves when the operation starts, a sync one by completing, to `Result<StartedNexusOperation, Failure>`; the start failure is a proto `Failure` (`workflow/src/runtime/model/nexus.rs:4,16-33`), so wrap its message in an `ApplicationFailure` to fail the caller.
- `started.result()` (`workflow_context/nexus.rs:113-120`) resolves to the proto `NexusOperationResult`, whose `status` is `completed`, `failed`, `cancelled` or `timed_out` (`protos/protos/local/temporal/sdk/core/nexus/nexus.proto:14-21`). Decode the completed payload into the `.twf` type; the rest fail the caller unless the `.twf` handles them. `RawValue::from_value` and `to_value` panic on a conversion error (`common-wasm/src/data_converters.rs:444-467`).
- No contract type checks the operation or its input against the handler, which runs in another SDK ([nexus-service-def.md](./nexus-service-def.md)). Keep the endpoint and service names as constants beside the caller, and wrap a design's several calls in one helper that builds the options and decodes the result.
- Bound to a promise, the promise is `ctx.start_nexus_operation(options)`, and the `await` takes the start and then `.result()` ([promise.md](./promise.md)). Options: [options.md](./options.md#nexus-operation-options). Fire-and-forget: [detach.md](./detach.md).
