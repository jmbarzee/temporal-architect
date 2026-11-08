# control flow and assignment

Direct Ruby equivalents:

| DSL | Ruby |
|-----|------|
| `x = expr` | `x = expr` |
| `if (c):` … `else:` | `if c … else … end` |
| `for (item in items):` | `items.each do \|item\| … end` |
| `for (retries < max):` | `while retries < max … end` |
| `for:` | `loop do … end` |
| `switch (v):` `case "a":` … `else:` | `case v when 'a' … else … end`; a `when` never falls through |
| `break` / `continue` | `break` / `next`; inside an `each` or `loop` block, both act on that loop |
| `and` / `or` / `not` | `&&` / `\|\|` / `!` (not Ruby's low-precedence `and` / `or` / `not`) |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are instance variables set in `initialize`; a local inside a handler is invisible to the main flow and other handlers.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints); `Hash` iteration is insertion-ordered, so it is deterministic when the insertions are.
- **A bare `for` is sequential** (each call blocks the workflow's fiber). `await all:` around a `for` is the fan-out in [await-all.md](./await-all.md).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `retry_policy:` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
