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

### Nil-pointer method binding

Workflow bodies reference an activity by **method value on a nil struct pointer** so the call is type-checked and the name is derived from the method — no string literal:

```go
var a *Activities // nil; never dereferenced — only its method value is taken
workflow.ExecuteActivity(ctx, a.ChargePayment, order).Get(ctx, &receipt)
```

The worker must still register a **real, fully-constructed** instance (`w.RegisterActivity(&Activities{db: db})`). The nil pointer in the workflow only names the activity; the registered instance is what actually runs. The two must name the same type.

## Dependency injection into activity structs

Activities reach external systems through dependencies held on the struct. Construct the struct with its dependencies at startup and register it:

```go
acts := &Activities{db: db, payments: paymentsClient}
w.RegisterActivity(acts)
```

In larger apps this is wired with `fx` (an `fx.go` per package provides the client and the activities struct, and a registration function calls `w.RegisterActivity` / the generated helper). Keep construction at the composition root — workflows and activity bodies never build their own dependencies.

## Proto-driven registration

When the project is [proto-driven](./proto-driven.md), the generator emits registration helpers — use them instead of hand-registering each type:

```go
pb.RegisterMyServiceActivities(w, acts)   // registers every activity on the service at once
pb.RegisterMyServiceWorkflows(w, wfs)     // if the service declares workflows
```

A missing helper call is the proto-driven form of an unregistered type: the worker starts fine and fails the task at runtime.

## Nexus service registration

Register a Nexus service on the **handler** worker (the target namespace's worker), alongside its handler workflows:

```go
service := nexus.NewService(BillingServiceName)
_ = service.Register(ChargePaymentOperation)
w.RegisterNexusService(service)
w.RegisterWorkflow(BillingChargeWorkflow) // handler workflows must also be registered
```

Creating the Nexus **endpoint** that routes to this service is out-of-band infrastructure (`tcld` / Terraform), not worker code — that belongs to a future `author-infra` skill. See [nexus-service-def.md](./nexus-service-def.md) for the handler/operation patterns.

## Graceful shutdown

`worker.InterruptCh()` stops the worker cleanly on SIGINT/SIGTERM, draining in-flight tasks:

```go
if err := w.Run(worker.InterruptCh()); err != nil {
    log.Fatalln("worker stopped", err)
}
```

Close the Temporal client (`defer c.Close()`) and any injected dependencies (DB pools, external clients) after `Run` returns.

## Registration coverage & the TWF↔Go bridge

**Coverage reality:**

- An **unregistered type fails the task, not the workflow.** The task returns to the queue for another worker; the workflow itself does not fail, but latency and wasted resources accumulate. This silent degradation is why coverage matters.
- **All workers on the same task queue must register the identical Workflow Type and Activity Type set.** A partial set on one worker means tasks intermittently land on a worker that can't run them.
- Multiple DSL `worker` blocks with different type sets must use **different task queues**.

**The TWF↔Go bridge:** the design-time topology maps directly onto worker wiring —

| TWF | Go |
|-----|-----|
| `worker Name:` (its workflow/activity members) | the registered type set on one `worker.New` |
| `namespace` + `task_queue` option | `worker.New(client, taskQueue, ...)` |

The resolver previews coverage gaps **at design time**: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` flag a type no worker covers, and `IMPLICIT_ROUTING_MISMATCH` flags a routing mismatch. Treat a clean resolve as the design-time analog of full registration. These same codes are also a **reverse-reading signal**: when recovering a `.twf` from existing Go, the registered set on each `worker.New` is what populates each `worker` block.

## Deferred: worker runtime options

Worker tuning is **not** modeled in TWF yet and is deliberately out of scope here — do not invent DSL for it (tracked in `dsl/BACKLOG.md`, Worker Runtime Options). This includes:

- `MaxConcurrentActivityExecutionSize` / `MaxConcurrentWorkflowTaskExecutionSize` and friends
- activity/workflow-task rate limiters
- sticky execution cache settings
- worker versioning / Build IDs / deployments

If the user needs these today, set them directly in `worker.Options` in the generated Go — but keep them out of the `.twf`.
