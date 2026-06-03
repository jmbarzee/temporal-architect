# assignment

## DSL

```twf
paymentStatus = "pending"
status = "awaiting_payment"
```

## Go

```go
paymentStatus := "pending"
status := "awaiting_payment"

// Reassignment (variable already declared):
status = "processing"

// Struct assignment from activity result or constructor:
order := Order{Status: "new", Items: items}

// Slice/map:
var results []ProcessResult
totals := make(map[string]int)
```

## Notes

- First use of a variable → `:=` (short declaration); subsequent assignments → `=`
- Workflow-scoped variables are declared at the top of the workflow function so signal/update handlers can access them via closure
- DSL assignments in `state:` blocks and signal handler bodies all map to the same workflow-level variables

## Pitfalls

- **Closure scoping.** Variables declared inside a handler (signal, update, query) are invisible to the main workflow flow and to other handlers. If a value must be shared, declare the variable at workflow scope (top of the workflow function) and mutate it from the handler via closure
- **Determinism.** Workflow variables must not be assigned from non-deterministic sources (`time.Now()`, `rand`, HTTP responses, global mutable state). Use `workflow.Now()`, `workflow.SideEffect()`, or activity results instead. See [workflow-def.md](./workflow-def.md) for the full constraint list
