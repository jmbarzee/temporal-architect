# control flow and assignment

Elixir has no loop statements and no mutation, so loops are `Enum` calls or recursion, and a value a branch changes is that branch's result:

| DSL | Elixir |
|-----|--------|
| `x = expr` (first use) / again | `x = expr` / `x = expr`, rebinding; a rebinding inside `if`, `case` or a function body is invisible outside it, so return the new value instead: `x = if c, do: a, else: x` |
| `if (c):` … `else:` | `if c do … else … end` |
| `for (item in items):` | `Enum.each(items, fn item -> … end)`; `Enum.reduce(items, acc, fn item, acc -> … end)` when the body updates a variable |
| `for (retries < max):` | a recursive private function: `defp loop(retries) when retries < max, do: …; loop(retries + 1)` |
| `for:` | a recursive function with no guard |
| `switch (v):` `case "a":` … `else:` | `case v do "a" -> …; _ -> … end`; cases never fall through |
| `break` / `continue` | in `Enum.reduce_while/3`, `{:halt, acc}` / `{:cont, acc}`; in a recursive loop, return / recurse |
| `and` / `or` / `not` | `and` / `or` / `not` (booleans only) |

- **Workflow-scoped variables.** `state:` variables and anything a signal or query reads live in the main execution ([condition.md](./condition.md)); a variable bound in one branch or callback is invisible to the rest.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints).
- **A bare `for` is sequential**: each call with `wait: true` blocks. `await all:` around a `for` is the fan-out in [await-all.md](./await-all.md).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `retry_policy:` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
