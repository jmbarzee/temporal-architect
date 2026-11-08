# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `cpanfile`'s `requires`.
- **If none:** offer the user specific options with tradeoffs; an async client (one returning `Future`s) suits an `async method` activity, a blocking one a plain `method` ([activity-def.md](./activity-def.md)).
- **Trace the chosen API** from the method the activity calls down to concrete values, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the module and version, the method, what each argument holds, and what it returns, confirmed from the installed module's POD or source, not inferred from names.

```
ChargePayment → HTTP::Tiny 0.086 (core)
  $http->request($method, $url, \%options): hashref { success, status, reason, content, headers }
LoadOrderRecord → DBI 1.643 + DBD::Pg
  $dbh->selectrow_hashref($statement, \%attr, @bind_values): hashref of one row, or undef
CalculateTotal → pure logic (no dependency)
```
