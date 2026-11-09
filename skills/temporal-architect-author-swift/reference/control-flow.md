# control flow and assignment

Direct Swift equivalents:

| DSL | Swift |
|-----|------|
| `x = expr` (first use) / again | `var x = expr` (`let` if never reassigned) / `x = expr` |
| `if (c):` … `else:` | `if c { … } else { … }` |
| `for (item in items):` | `for item in items { … }` |
| `for (retries < max):` | `while retries < max { … }` |
| `for:` | `while true { … }` |
| `switch (v):` `case "a":` … `else:` | `switch v { case "a": …; default: … }`; cases never fall through |
| `break` / `continue` | `break` / `continue`; inside a `switch`, `break` leaves the `switch`, so leave the loop with a labeled `break outer` |
| `and` / `or` / `not` | `&&` / `\|\|` / `!` |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are stored `var`s of the `@Workflow` struct; a local declared inside a handler is invisible to the main flow and other handlers.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints); iterating a `Dictionary` or `Set` included, whose order is seeded per process: iterate sorted keys.
- **A bare `for` is sequential** (each `try await` suspends until its call returns). `await all:` around a `for` is the fan-out in [await-all.md](./await-all.md).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to a `RetryPolicy` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
