# Activity Definitions

```
activity_def ::= 'activity' IDENT params ['->' return_type] ':' NEWLINE
                 INDENT
                 statement*
                 DEDENT
```

Return type is optional; if present, must be parenthesized (e.g., `-> (Result)`).

Activities have access to a restricted statement set (no temporal primitives like timers or child workflows). **Activities cannot call other activities** — this is not a Temporal primitive and is not supported. Activities may use the `heartbeat()` primitive to report progress during long-running operations.

**Cross-package references.** In an activity *call* (`activity Name(args)`), the callee name is a
[`qualified_ref`](./14-packages-and-imports.md) — it may carry an optional `pkg.` package
qualifier (`activity billing.ChargeCard(order)`) to name an activity declared in another package.
The qualifier is bare for same-package activities. It is carried on the AST/wire but not resolved
in this slice (cross-package resolution is deferred to #109).
