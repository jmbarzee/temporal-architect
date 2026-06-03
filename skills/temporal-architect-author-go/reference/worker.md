# worker

## DSL

```twf
worker orderTypes:
    workflow ProcessOrder
    activity ValidateOrder
    activity ChargePayment

namespace default:
    worker orderTypes
        options:
            task_queue: "orders"
```

## Go

```go
import (
    "log"

    "go.temporal.io/sdk/client"
    "go.temporal.io/sdk/worker"
)

func main() {
    c, err := client.Dial(client.Options{})
    if err != nil {
        log.Fatalln("Unable to create client", err)
    }
    defer c.Close()

    w := worker.New(c, "orders", worker.Options{})

    w.RegisterWorkflow(ProcessOrder)
    w.RegisterActivity(&Activities{/* dependencies */})

    err = w.Run(worker.InterruptCh())
    if err != nil {
        log.Fatalln("Unable to start worker", err)
    }
}
```

## Notes

- `worker.New(client, taskQueue, options)` — task queue comes from namespace `options: task_queue`
- `RegisterWorkflow(func)` — one call per workflow in the worker's type set
- `RegisterActivity(struct)` — register the activity struct (all exported methods become activities) or individual functions
- `worker.InterruptCh()` for graceful shutdown on SIGINT/SIGTERM
- Multiple `worker` blocks in the DSL with different task queues → multiple `worker.New` calls in the same `main()`
- For nexus services on the same worker, see [nexus-service-def.md](./nexus-service-def.md)

## When to use: struct vs function registration

- **Struct registration** (`w.RegisterActivity(&Activities{...})`): standard pattern. All exported methods on the struct become activities. Use when activities share dependencies (DB connections, API clients) injected via the struct
- **Individual function registration** (`w.RegisterActivity(SomeFunc)`): use when activities span multiple structs with different dependency sets, or for standalone functions with no dependencies
- `RegisterActivityWithOptions` with `Name` sets a prefix for struct methods or overrides the name for individual functions
- Registration panics if two activities share the same type name. Use `DisableAlreadyRegisteredCheck: true` in tests only
- If a struct has exported methods that don't match the activity signature `(context.Context, ...) (..., error)`, registration panics. Set `SkipInvalidStructFunctions: true` to skip them

## Pitfalls

- **All workers on the same task queue must register the exact same Workflow Types and Activity Types.** If a worker picks up a task for an unregistered type, it fails that task. The task returns to the queue and can be picked up by another worker — the workflow does not fail, but latency increases and resources are wasted
- When the DSL has multiple `worker` blocks with different type sets, they must use different task queues
