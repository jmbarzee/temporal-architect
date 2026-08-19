# Activity Definitions

```
activity_def ::= 'activity' IDENT params ['->' return_type] ':' NEWLINE
                 INDENT
                 [default_options_block]
                 statement*
                 DEDENT
```

Return type is optional; if present, must be parenthesized (e.g., `-> (Result)`).

An optional `default_options:` block (see [Statement Syntax — Definition Default Options](./06-statement-syntax.md)) may lead the activity body, before any statements. It supplies the call-option defaults (timeouts, retry policy, task queue, priority) for every call to this activity; a call site's `options:` block overrides them per key.

Activities have access to a restricted statement set (no temporal primitives like timers or child workflows). **Activities cannot call other activities** — this is not a Temporal primitive and is not supported. Activities may use the `heartbeat()` primitive to report progress during long-running operations.

**Cross-package references.** In an activity *call* (`activity Name(args)`), the callee name is a
[`qualified_ref`](./14-packages-and-imports.md) — it may carry an optional `pkg.` package
qualifier (`activity billing.ChargeCard(order)`) to name an activity declared in another package.
The qualifier is bare for same-package activities. A qualified callee resolves against the imported
package that declares it; if that import is unresolved (external), the qualified call resolves as
external.
