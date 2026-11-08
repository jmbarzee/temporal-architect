# control flow and assignment

Direct Python equivalents:

| DSL | Python |
|-----|--------|
| `x = expr` | `x = expr` (snake_case name) |
| `if (c):` … `else:` | `if c:` … `else:` |
| `for (item in items):` | `for item in items:` |
| `for (retries < max):` | `while retries < max:` |
| `for:` | `while True:` |
| `switch (v):` `case "a":` … `else:` | `match v:` `case "a":` … `case _:` |
| `break` / `continue` | `break` / `continue` |
| `and` / `or` / `not` | `and` / `or` / `not` |

- **Workflow-scoped variables.** `state:` variables and anything a handler reads or writes are attributes set in `__init__` (`self.status`); a local in `run` is invisible to handlers, and a local in a handler to `run` and other handlers.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints).
- **A bare `for` is sequential** (`await` inside the loop). `await all:` around a `for` is the [fan-out](./await-all.md#fan-out).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `retry_policy` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
