# control flow and assignment

Haskell has no mutable locals or loop keywords, so each form maps to a binding, a `StateVar`, or recursion in `Workflow`:

| DSL | Haskell |
|-----|---------|
| `x = expr` (first use) | `let x = expr`, or `x <- action` for a call |
| `x = expr` again | a new binding shadowing the old; across loop iterations or handlers, a `StateVar` with `writeStateVar` |
| `if (c):` … `else:` | `if c then … else …`; with no `else`, `when c …` |
| `for (item in items):` | `for_ items \item -> …` |
| `for (retries < max):` | a local recursive `loop`, its state as arguments, signed `loop :: RequireCallStack => Int -> Workflow ()` ([workflow-def.md](./workflow-def.md)): `loop retries = when (retries < max) do { …; loop (retries + 1) }` |
| `for:` | `forever …`, or a recursive `loop` that returns to leave it |
| `switch (v):` `case "a":` … `else:` | `case v of "a" -> …; _ -> …` |
| `break` / `continue` | a recursive `loop` returns (`break`) or calls itself (`continue`); `for_` has neither |
| `and` / `or` / `not` | `&&` / `\|\|` / `not` |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are `StateVar`s created at the top of the workflow body (`newStateVar`); a handler sees them by closure, and a local `let` inside one handler is invisible to the rest.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints); `map[string, V]` is a `Map`, whose folds run in key order ([idioms.md § determinism](./idioms.md#determinism)).
- **A bare `for` is sequential** (each step bound in `Workflow`). `await all:` around a `for` is the [fan-out](./await-all.md#fan-out).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `retryPolicy` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
