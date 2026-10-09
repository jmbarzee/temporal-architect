# control flow and assignment

Direct Go equivalents:

| DSL | Go |
|-----|----|
| `x = expr` (first use) / again | `x := expr` / `x = expr` |
| `if (c):` … `else:` | `if c { … } else { … }` |
| `for (item in items):` | `for _, item := range items { … }` |
| `for (retries < max):` | `for retries < max { … }` |
| `for:` | `for { … }` |
| `switch (v):` `case "a":` … `else:` | `switch v { case "a": … default: … }` |
| `break` / `continue` | `break` / `continue` |
| `and` / `or` / `not` | `&&` / `\|\|` / `!` |

- **Workflow-scoped variables.** Declare at the top of the workflow function. `state:` variables and handler bodies all mutate these via closure; a variable declared inside a signal/update/query handler is invisible to the main flow and other handlers.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints).
- **A bare `for` is sequential** (`.Get()` inside the loop). `await all:` around a `for` is the [fan-out](./await-all.md#fan-out).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `RetryPolicy` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
