# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `.cabal` (or `package.yaml`) `build-depends`.
- **If none:** offer the user specific options with tradeoffs.
- **Trace the chosen API** from the function the activity calls down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the package, the function, every argument type, and the result type, confirmed from the resolved version's haddock or source, not inferred from names.

```
ChargePayment → http-client
  httpLbs :: Request -> Manager -> IO (Response ByteString)
LoadOrderRecord → postgresql-simple
  query :: (ToRow q, FromRow r) => Connection -> Query -> q -> IO [r]
CalculateTotal → pure logic (no dependency)
```

## The SDK itself

The SDK is not on Hackage past `2025.10.1.0`, which predates Nexus, so a new project builds `temporal-sdk`, `temporal-sdk-core` and `temporal-api-protos` from a clone of `hs-temporal-sdk` at the pin, listed as local packages in `cabal.project`, as the corpus's `corpus/cabal.project` does. A `source-repository-package` builds them but cannot link the Rust bridge: `temporal-sdk-core`'s custom setup registers its temporary build directory as the bridge's library directory (`core/Setup.hs:114-119`). The build also needs:

- **`constraints: time-compat < 1.9.8`** in `cabal.project`. From `1.9.8`, `time-compat` defines the `Lift` instances that `temporal-sdk` also defines for `DiffTime`, `NominalDiffTime` and `Day`, and the duplicates fail its compile (`SearchAttributes.hs:249-261`).
- **A Rust toolchain and `protoc`** on the `PATH`: the bridge is a Cargo build that setup runs, and a protobuf dependency runs `protoc` in its own.
- **A freeze file** (`cabal freeze`): fresh Hackage resolution can pick versions the pin was never built with.
