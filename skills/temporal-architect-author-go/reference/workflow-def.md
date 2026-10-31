# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
    close complete(Result{status: "done"})
```

```go
func ProcessOrder(ctx workflow.Context, order Order) (Result, error) {
    return Result{Status: "done"}, nil
}
```

`workflow.Context` is always first and `error` always last: no DSL return type → `func Name(ctx workflow.Context, params...) error`; `-> (A, B)` → `(A, B, error)`.

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
    id_scheme: "ship-{order.id}-{item.id}"
```

```go
func ShipItemID(orderID, itemID string) string { return fmt.Sprintf("ship-%s-%s", orderID, itemID) }
```

One ID function per scheme, beside the workflow, taking one argument per hole. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

## Determinism constraints

Every replay must produce the same commands in the same order; a violation fails the Workflow Task with a non-deterministic error, retried indefinitely until the code is fixed.

| Forbidden | Use instead |
|-----------|-------------|
| `time.Now()` | `workflow.Now(ctx)` |
| `time.Sleep()` | `workflow.Sleep(ctx, d)` |
| `math/rand`, `crypto/rand` | `workflow.SideEffect()` or an activity |
| HTTP, network, file I/O, database | an activity |
| `go` | `workflow.Go(ctx, func(gCtx workflow.Context) { ... })` |
| native `chan`, `select` | `workflow.Channel`, `workflow.Selector` |
| `range` over a `map` | sort the keys, then iterate |
| global mutable state | workflow-local variables or activity results |
| standard loggers | `workflow.GetLogger(ctx)` |

Safe to change on running workflows: activity/child input values, timer durations (except to zero), calls that produce no commands (`workflow.GetInfo()`, `workflow.GetLogger()`). Anything else goes behind `workflow.GetVersion()` or `workflow.Patched()`.
