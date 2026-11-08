# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `Gemfile`.
- **If none:** offer the user specific options with tradeoffs.
- **Trace the chosen API** from the method the activity calls down to concrete values, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the gem and version, the method, every argument's shape, and the return value, confirmed from the installed gem's source or signatures, not inferred from names.

```
ChargePayment → stripe (Gemfile.lock)
  Stripe::PaymentIntent.create(params = {}, opts = {}) → Stripe::PaymentIntent; raises Stripe::StripeError
LoadOrderRecord → pg (Gemfile.lock)
  PG::Connection#exec_params(sql, params) → PG::Result; raises PG::Error
CalculateTotal → pure logic (no dependency)
```
