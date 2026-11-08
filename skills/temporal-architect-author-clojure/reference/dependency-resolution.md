# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the project file's dependencies (`project.clj` `:dependencies`, `deps.edn` `:deps`, `pom.xml` `<dependencies>`).
- **If none:** offer the user specific options with tradeoffs: a Clojure library, or a Java library through interop.
- **Trace the chosen API** from the function the activity calls down to concrete values, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the artifact, the function or method, every parameter's shape, and the return, confirmed from the resolved artifact's source or docs, not inferred from names. Each client it names becomes a key of the worker's `:ctx` ([activity-def.md](./activity-def.md)).

```
ChargePayment → com.stripe/stripe-java (interop)
  PaymentIntent/create(PaymentIntentCreateParams params, RequestOptions options): PaymentIntent throws StripeException
LoadOrderRecord → com.github.seancorfield/next.jdbc
  next.jdbc/execute-one! [connectable sql-params]: map with namespaced keys, or nil
CalculateTotal → pure logic (no dependency)
```
