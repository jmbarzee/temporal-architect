# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `Package.swift` `dependencies:`.
- **If none:** offer the user specific options with tradeoffs.
- **Trace the chosen API** from the method the activity calls down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the package, the method, every parameter type, and the return type, confirmed from the resolved package's source, not inferred from names.

```
ChargePayment → async-http-client (github.com/swift-server/async-http-client)
  HTTPClient.execute(_ request: HTTPClientRequest, timeout: TimeAmount, logger: Logger?) async throws -> HTTPClientResponse
LoadOrderRecord → postgres-nio (github.com/vapor/postgres-nio)
  PostgresClient.query(_ query: PostgresQuery, logger: Logger?, file: String, line: Int) async throws -> PostgresRowSequence
CalculateTotal → pure logic (no dependency)
```
