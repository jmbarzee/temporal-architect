# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `pom.xml` `<dependencies>`.
- **If none:** offer the user specific options with tradeoffs.
- **Trace the chosen API** from the method the activity calls down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the artifact, the method, every parameter type, and the return type, confirmed from the resolved artifact's source or javadoc, not inferred from names.

```
ChargePayment → com.stripe:stripe-java
  PaymentIntent.create(PaymentIntentCreateParams params, RequestOptions options): PaymentIntent throws StripeException
LoadOrderRecord → org.postgresql:postgresql (via java.sql)
  PreparedStatement.executeQuery(): ResultSet throws SQLException
CalculateTotal → pure logic (no dependency)
```
