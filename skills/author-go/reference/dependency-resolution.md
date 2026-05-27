# dependency resolution

Scan all activities in the `.twf` and identify external integration points. Most activities are thin wrappers around calls to external systems — the activity itself is simple, but the dependency behind it is not.

## For each activity

- **Categorize:** external API call, storage operation, protocol client, or pure logic
- **Check existing code:** does the project already have a client/library for this?
- **Check `go.mod`:** is a relevant SDK already imported?
- **If unresolved:** suggest specific options with tradeoffs to the user
- **Read the chosen dependency's API:** identify the method the activity will call, then trace its signature to concrete types. See [types.md](./types.md) for the full resolution strategy

Resolve as many as possible early — it prevents expensive rework later. If a dependency choice is unclear or blocked on another decision, defer it and continue.

## Deliverable

A dependency map, presented to the user for confirmation before generation begins.

A dependency is resolved when you can write the call expression with verified types. The map should include the method, every parameter type, and the return type — all confirmed from `go doc` or source, not inferred from names.

```
Example dependency map:
  ChargePayment → stripe-go
    paymentintent.New(params *stripe.PaymentIntentParams) (*stripe.PaymentIntent, error)
  SendPaymentConfirmation → sendgrid-go
    client.SendWithContext(ctx, mail *sgmail.SGMailV3) (*rest.Response, error)
  LoadOrderRecord → database/sql (no external dependency)
  CalculateTotal → pure logic (no dependency)
```
