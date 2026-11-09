# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `mix.exs` `deps`.
- **If none:** offer the user specific Hex packages with tradeoffs.
- **Trace the chosen API** from the function the activity calls down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the package, the function, every argument type, and the return type, confirmed from the locked version's source or hexdocs, not inferred from names.

```
ChargePayment → stripity_stripe
  Stripe.PaymentIntent.create(params :: map(), opts :: Keyword.t()) :: {:ok, Stripe.PaymentIntent.t()} | {:error, Stripe.Error.t()}
LoadOrderRecord → postgrex
  Postgrex.query(conn, statement :: iodata(), params :: list()) :: {:ok, Postgrex.Result.t()} | {:error, Exception.t()}
CalculateTotal → pure logic (no dependency)
```
