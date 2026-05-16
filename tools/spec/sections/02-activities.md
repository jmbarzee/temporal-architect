# Activity Definitions

```
activity_def ::= 'activity' IDENT params ['->' return_type] ':' NEWLINE
                 INDENT
                 statement*
                 DEDENT
```

Return type is optional; if present, must be parenthesized (e.g., `-> (Result)`).

Activities have access to a restricted statement set (no temporal primitives like timers or child workflows). Activities may use the `heartbeat()` primitive to report progress during long-running operations.
