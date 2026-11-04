# discovery

The Go signals the design skill's [reverse engineering](../../temporal-architect-design/reference/reverse-engineering.md#language-signals) reads code by. Call sites read backward through the [reference index](../SKILL.md#reference-index): `workflow.ExecuteActivity` is an `activity` call, `workflow.ExecuteChildWorkflow` a `workflow` call, `NexusClient.ExecuteOperation` a `nexus` call.

## Project roots

- A `go.mod` marks a module root, and its `module` line is the path `twf mod init` takes. A `go.work` joins several modules, each its own root.
- A module that requires `go.temporal.io/sdk` uses Temporal.

## Registration

- `worker.New(client, taskQueue, …)` starts a worker on a queue in its client's namespace (`client.Dial` `Namespace`). Each `worker.New` and the types registered on it make one `worker` block ([worker.md](./worker.md#registration)), annotated `@sdk(go, "<path>")` with the file that calls `worker.New`.
- `RegisterWorkflow(fn)` registers the function's name; `RegisterActivity(&S{})` every exported method of `S`. `…WithOptions` with `Name` overrides the name, or prefixes a struct's methods.
- A queue built from an instance key (`"sandbox-"+id`) is a [family](./worker.md#per-instance-worker-families) worker.
- `nexus.NewService(name)` + `service.Register(ops…)` + `w.RegisterNexusService(service)` is a Nexus service and its operations ([nexus-service-def.md](./nexus-service-def.md)). A `Register` of only some of a service's operations is a forked contract.
- DI wiring (fx, wire) hides `worker.New` behind providers; follow them to it.

## Concurrency

| Go | `.twf` |
|----|--------|
| `workflow.Go` + futures joined | `await all` ([await-all.md](./await-all.md)) |
| `workflow.NewSelector` | `await one` ([await-one.md](./await-one.md)) |
| future held, `.Get` later | `promise` ([promise.md](./promise.md)) |
| `.Get` right after the call | synchronous call |
| `workflow.Await` on a `bool` | `condition` ([condition.md](./condition.md)) |

## Codegen

- **Proto-driven** when any of: `buf.gen.yaml` with a `protoc-gen-go_temporal` plugin; `*_temporal.pb.go` files; `(temporal.v1.activity)` / `(temporal.v1.workflow)` annotations. Read the `.proto`, not the generated code; the [generated-symbol table](./proto-driven.md#generated-symbol-table) maps `XxxActivities`, `RegisterXxxActivities`, and `XxxFuture` back to the `activity` / `workflow`.
- `//go:generate` directives and Makefile targets name any other generator.
