# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and `go.mod`.
- **If none:** offer the user specific options with tradeoffs.
- **Trace the chosen API** from the method the activity calls down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the method, every parameter type, and the return type, confirmed from `go doc` or source, not inferred from names.

```
ChargePayment → stripe-go
  paymentintent.New(params *stripe.PaymentIntentParams) (*stripe.PaymentIntent, error)
SendPaymentConfirmation → sendgrid-go
  client.SendWithContext(ctx, mail *sgmail.SGMailV3) (*rest.Response, error)
LoadOrderRecord → database/sql (no external dependency)
CalculateTotal → pure logic (no dependency)
```
