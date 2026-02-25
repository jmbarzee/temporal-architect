# workflow definition

## DSL

```twf
workflow ProcessOrder(order: Order) -> (Result):
    # body
    close complete(Result{status: "done"})
```

## Go

```go
import "go.temporal.io/sdk/workflow"

func ProcessOrder(ctx workflow.Context, order Order) (Result, error) {
    // body
    return Result{Status: "done"}, nil
}
```

## Notes

- Every workflow returns `error` as the last return value, even if the DSL has no return type (signature becomes `func Name(ctx workflow.Context, params...) error`)
- `workflow.Context` is always the first parameter
- Multiple return types `-> (A, B)` → `func Name(ctx workflow.Context, ...) (A, B, error)`

## Determinism constraints

Workflow functions must be deterministic — every replay must produce the same commands in the same order. Violating determinism causes a non-deterministic error: the Workflow Task fails and retries indefinitely until the code is fixed.

**Forbidden in workflow code:**
- `time.Now()` → use `workflow.Now(ctx)`
- `time.Sleep()` → use `workflow.Sleep(ctx, duration)`
- `math/rand`, `crypto/rand` → use `workflow.SideEffect()` or compute in an activity
- HTTP clients, network calls, file I/O, database access → move to activities
- `go` keyword → use `workflow.Go(ctx, func(gCtx workflow.Context) { ... })`
- Native `chan`, `select` → use `workflow.Channel`, `workflow.Selector`
- `range` over `map` → sort keys first, then iterate
- Global mutable state → use workflow-local variables or activity results
- Standard loggers → use `workflow.GetLogger(ctx)`

**Safe changes** (do not break determinism): changing activity/child workflow input values, changing timer durations (except to zero), adding calls that don't produce commands (`workflow.GetInfo()`, `workflow.GetLogger()`).

Use `workflow.GetVersion()` or `workflow.Patched()` to safely modify running workflow definitions.
