# control flow and assignment

Direct Java equivalents:

| DSL | Java |
|-----|------|
| `x = expr` (first use) / again | `var x = expr;` / `x = expr;` |
| `if (c):` … `else:` | `if (c) { … } else { … }` |
| `for (item in items):` | `for (var item : items) { … }` |
| `for (retries < max):` | `while (retries < max) { … }` |
| `for:` | `while (true) { … }` |
| `switch (v):` `case "a":` … `else:` | `switch (v) { case "a" -> …; default -> …; }`; arrow cases never fall through |
| `break` / `continue` | `break` / `continue`; inside a `switch`, `break` leaves the `switch`, so leave the loop with a labeled `break outer` |
| `and` / `or` / `not` | `&&` / `\|\|` / `!` |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are fields of the workflow impl; a local declared inside a handler is invisible to the main flow and other handlers.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints); iterating a `HashMap` or `HashSet` included (`temporal-developer` `references/java/determinism.md` § Forbidden Operations in Workflows).
- **A bare `for` is sequential** (each stub call blocks). `await all:` around a `for` is the fan-out in [await-all.md](./await-all.md).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `RetryOptions` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
