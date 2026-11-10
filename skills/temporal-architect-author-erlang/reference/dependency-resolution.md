# dependency resolution

Most activities are thin wrappers; the dependency behind them is the hard part. For each activity in the `.twf`:

- **Categorize:** external API, storage, protocol client, or pure logic.
- **Look for an existing client** in the project code and the `rebar.config` `deps`.
- **If none:** offer the user specific Hex packages with tradeoffs.
- **Trace the chosen API** from its `-spec` in `_build/default/lib/<dep>/` (`_build/rebar3/default/lib/<dep>/` under the corpus's `base_dir`), at the version `rebar.lock` pins, down to concrete types, per [types.md § Dependency types](./types.md#dependency-types).

Resolve early to avoid rework; defer a choice that is unclear or blocked and keep going.

**Deliverable:** a dependency map the user confirms before generation — per activity, the package, the function, every argument type, and the return type, confirmed from the locked version's source or hexdocs, not inferred from names.

```
ChargePayment → hackney
  hackney:request(Method :: atom() | binary(), URL :: url(), Headers :: list(), Body :: term(), Options :: list()) -> request_ret()
LoadOrderRecord → epgsql
  epgsql:equery(connection(), sql_query(), [bind_param()]) -> epgsql_cmd_equery:response() | epgsql_sock:error()
CalculateTotal → pure logic (no dependency)
```
