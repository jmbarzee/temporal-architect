# control flow and assignment

Erlang has no loop statements and **single assignment**: a bound variable never changes, so loops are `lists` calls or recursion, and a value a branch changes is that branch's result:

| DSL | Erlang |
|-----|--------|
| `x = expr` (first use) / again | `X = Expr` / a new name, `X1 = Expr`: `X = Other` on a bound `X` is a match, which raises `badmatch` when the values differ. A branch that changes a value returns it: `X1 = case C of true -> A; false -> X end` |
| `if (c):` … `else:` | `case C of true -> …; false -> … end`; Erlang's `if` takes guards only, so never a function call |
| `for (item in items):` | `lists:foreach(fun(Item) -> … end, Items)`; `lists:foldl(fun(Item, Acc) -> … end, Acc0, Items)` when the body updates a variable |
| `for (retries < max):` | a recursive function with a guard: `loop(Retries, Max) when Retries < Max -> …, loop(Retries + 1, Max); loop(_, _) -> done.` |
| `for:` | a recursive function with no guard |
| `switch (v):` `case "a":` … `else:` | `case V of ~"a" -> …; _ -> … end`; cases never fall through |
| `break` / `continue` | a recursive loop: `break` returns its result early, and `continue` recurses on the rest; in `lists:foldl`, `continue` returns the accumulator unchanged. `lists` has no `reduce_while`, so a loop that breaks is recursion |
| `and` / `or` / `not` | `andalso` / `orelse` / `not`: `and` and `or` evaluate both sides |

- **A failed match raises,** and a raise fails only the workflow task, which the server retries while the run stays open ([author-elixir activity-call.md](../../temporal-architect-author-elixir/reference/activity-call.md)), so a value that may differ goes through `case`, never `=`.
- **Workflow-scoped variables.** `state:` variables and anything a signal or query reads live in the main execution's process dictionary ([condition.md](./condition.md)); a variable bound in a fun is invisible outside it.
- **Determinism.** Assignments and conditions follow [author-elixir idioms.md § determinism](../../temporal-architect-author-elixir/reference/idioms.md#determinism).
- **A bare `for` is sequential**: each call with `wait` blocks. `await all:` around a `for` is the fan-out in [await-all.md](./await-all.md).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `retry_policy` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
