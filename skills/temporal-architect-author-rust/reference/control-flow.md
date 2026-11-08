# control flow and assignment

Direct Rust equivalents:

| DSL | Rust |
|-----|------|
| `x = expr` (first use) / again | `let x = expr;`, `let mut x` when reassigned / `x = expr;` |
| `if (c):` … `else:` | `if c { … } else { … }` |
| `for (item in items):` | `for item in &items { … }` |
| `for (retries < max):` | `while retries < max { … }` |
| `for:` | `loop { … }` |
| `switch (v):` `case "a":` … `else:` | `match v.as_str() { "a" => …, _ => … }`; arms never fall through |
| `break` / `continue` | `break` / `continue`; a `match` is not a loop, so `break` in an arm leaves the enclosing loop |
| `and` / `or` / `not` | `&&` / `\|\|` / `!` |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are fields of the workflow struct; `run` reads and writes them through `ctx.state` and `ctx.state_mut`, whose borrow ends with the closure (`workflow/src/workflow_context.rs:2500-2521`). A local in `run` is invisible to handlers.
- **Determinism.** Assignments and conditions follow [idioms.md § Determinism](./idioms.md#determinism). Iterate a `Vec` or `BTreeMap`, never a `HashMap` or `HashSet` that drives commands: its default `RandomState` hasher is seeded per instance, so replay can iterate in another order (`std::collections::hash_map::RandomState`).
- **A bare `for` is sequential** (each call is awaited in turn). `await all:` around a `for` is the fan-out in [await-all.md](./await-all.md).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `retry_policy` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
