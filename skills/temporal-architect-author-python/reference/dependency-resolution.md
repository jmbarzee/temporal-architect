# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and `pyproject.toml`.
- **If none:** offer the user specific options with tradeoffs.
- **Trace the chosen API** from the method the activity calls down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the package, the method, every parameter type, and the return type, confirmed from the package's source or stubs, not inferred from names.

```
ChargePayment → stripe 16.1
  await stripe.PaymentIntent.create_async(**params: Unpack[stripe.params.PaymentIntentCreateParams]) -> stripe.PaymentIntent
LoadOrderRecord → asyncpg 0.32 (untyped: read from its source)
  await pool.fetchrow(query: str, *args: object, timeout: float | None = None) -> asyncpg.Record | None
CalculateTotal → pure logic (no dependency)
```
