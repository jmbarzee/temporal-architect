# control flow and assignment

Direct PHP equivalents:

| DSL | PHP |
|-----|-----|
| `x = expr` (first use) / again | `$x = expr` |
| `if (c):` … `else:` | `if (c) { … } else { … }` |
| `for (item in items):` | `foreach ($items as $item) { … }` |
| `for (retries < max):` | `while ($retries < $max) { … }` |
| `for:` | `while (true) { … }` |
| `switch (v):` `case "a":` … `else:` | `match ($v) { 'a' => …, default => … }` for one expression each; else `switch ($v) { case 'a': … break; default: … }`, every case ending in `break` |
| `break` / `continue` | `break` / `continue`; inside a `switch`, both leave only the `switch`, so the loop's are `break 2` / `continue 2` |
| `and` / `or` / `not` | `&&` / `\|\|` / `!` |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are properties of the workflow class; a local declared inside a handler is invisible to the main flow and other handlers.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints).
- **A bare `for` is sequential** (`yield` inside the loop). `await all:` around a `for` is a fan-out ([await-all.md](./await-all.md)).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `withRetryOptions` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
