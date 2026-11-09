# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `composer.json` `require`s.
- **If none:** offer the user specific options with tradeoffs.
- **Trace the chosen API** from the method the activity calls down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the package, the method, every parameter type, and the return type, confirmed from the installed package's source under `vendor/`, not inferred from names.

```
ChargePayment → stripe/stripe-php
  PaymentIntentService::create(null|array{amount: int, currency: string, …} $params = null, null|array|RequestOptions $opts = null): PaymentIntent  (types from its PHPDoc)
LoadOrderRecord → doctrine/dbal
  Connection::fetchAssociative(string $query, list<mixed>|array<string, mixed> $params = [], array $types = []): array<string, mixed>|false
CalculateTotal → pure logic (no dependency)
```
