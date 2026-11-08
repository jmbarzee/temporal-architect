# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `Cargo.toml` `[dependencies]`.
- **If none:** offer the user specific options with tradeoffs.
- **Trace the chosen API** from the function the activity calls down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the crate and version, the function, every parameter type, and the return type, confirmed from the crate's source or its docs.rs page at that version, not inferred from names.

```
NotifyCustomer → reqwest 0.13
  RequestBuilder::send(self) -> impl Future<Output = Result<Response, reqwest::Error>>
LoadInvoice → tokio 1 (fs)
  tokio::fs::read(path: impl AsRef<Path>) -> io::Result<Vec<u8>>  (async)
CalculateTotal → pure logic (no dependency)
```
