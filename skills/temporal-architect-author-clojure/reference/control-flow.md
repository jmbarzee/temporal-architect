# control flow and assignment

| DSL | Clojure |
|-----|---------|
| `x = expr` (first use) | `(let [x expr] …)` |
| `x = expr` again, or a `state:` variable | `(reset! x expr)` on an `atom` |
| `if (c):` … `else:` | `(if c … …)`; several branches → `(cond …)` |
| `for (item in items):` | `(doseq [item items] …)` |
| `for (retries < max):` | `(loop [retries 0] (when (< retries max) … (recur (inc retries))))` |
| `for:` | `(loop [] … (recur))` |
| `switch (v):` `case "a":` … `else:` | `(case v "a" … default)`; with no default, an unmatched `case` throws |
| `break` / `continue` | leave the `loop` by not calling `recur` / `recur` early; `doseq` has neither, so a loop that breaks is a `loop` |
| `and` / `or` / `not` | `and` / `or` / `not` |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are `atom`s in the `defworkflow`'s `let`, closed over by the handlers; a local bound inside a handler is invisible to the main flow and other handlers.
- **A value from a branch.** A `close` or a result inside `if` / `cond` / `case` is that form's value, so the branch's value must flow out to the body's last form ([close.md](./close.md)).
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints); never a global `atom` (`doc/workflows.md:39`).
- **A bare `for` is sequential** (each `@` blocks). `await all:` around a `for` is the fan-out in [await-all.md](./await-all.md).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `:retry-options` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
