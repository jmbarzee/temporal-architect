# control flow and assignment

Direct C# equivalents:

| DSL | C# |
|-----|----|
| `x = expr` (first use) / again | `var x = expr` / `x = expr` |
| `if (c):` … `else:` | `if (c) { … } else { … }` |
| `for (item in items):` | `foreach (var item in items) { … }` |
| `for (retries < max):` | `while (retries < max) { … }` |
| `for:` | `while (true) { … }` |
| `switch (v):` `case "a":` … `else:` | `switch (v) { case "a": … break; default: … break; }`; a C# section must end in `break` (no fall-through) |
| `break` / `continue` | `break` / `continue`; inside a `switch` section, `break` leaves the `switch`, not the loop |
| `and` / `or` / `not` | `&&` / `\|\|` / `!` |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are fields of the workflow class; a local declared inside a handler is invisible to the main flow and other handlers.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints); `foreach` over a `Dictionary` included (`temporal-developer` `references/dotnet/gotchas.md` § Dictionary Iteration Order).
- **A bare `for` is sequential** (`await` inside the loop). `await all:` around a `for` is the [fan-out](./await-all.md#fan-out).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `RetryPolicy` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
