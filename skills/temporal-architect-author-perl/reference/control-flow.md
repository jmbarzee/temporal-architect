# control flow and assignment

Direct Perl equivalents:

| DSL | Perl |
|-----|------|
| `x = expr` (first use) / again | `my $x = expr` / `$x = expr` |
| `if (c):` … `else:` | `if (c) { … } else { … }` |
| `for (item in items):` | `for my $item (@$items) { … }` |
| `for (k in m):` (a map) | `for my $k (sort keys %$m) { … }` |
| `for (retries < max):` | `while ($retries < $max) { … }` |
| `for:` | `while (1) { … }` |
| `switch (v):` `case "a":` … `else:` | `if ($v eq 'a') { … } elsif … else { … }`; never `given`/`when` (experimental) |
| `break` / `continue` | `last` / `next` |
| `and` / `or` / `not` | `&&` / `\|\|` / `!` |

- **Workflow-scoped variables.** `state:` variables and anything a signal, update or query handler reads are `field`s of the workflow class; a `my` inside a handler is invisible to the main flow and other handlers.
- **Determinism.** Assignments and conditions follow [workflow-def.md](./workflow-def.md#determinism-constraints). Perl randomizes hash order per process (`perlsec` § Algorithmic Complexity Attacks), so a replay on another worker walks `keys %$m` in another order: always `sort keys`.
- **A bare `for` is sequential** (`await` inside the loop). `await all:` around a `for` is the [fan-out](./await-all.md#fan-out).
- **Manual retry loops** (`for (retries < max)`) are almost always inferior to `retry_policy` in [options.md](./options.md); keep them only for non-standard control flow (retry with modified input, conditional retry on error type).
