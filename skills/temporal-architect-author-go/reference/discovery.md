# discovery

The Go signals the design skill's [reverse engineering](../../temporal-architect-design/reference/reverse-engineering.md#language-signals) reads code by. Call sites read backward through the [reference index](../SKILL.md#reference-index): `workflow.ExecuteActivity` is an `activity` call, `workflow.ExecuteChildWorkflow` a `workflow` call, `NexusClient.ExecuteOperation` a `nexus` call.

## Project roots

- A `go.mod` marks a module root, and its `module` line is the path `twf mod init` takes. A `go.work` joins several modules, each its own root.
- A module that requires `go.temporal.io/sdk` uses Temporal.

## Registration

- `worker.New(client, taskQueue, …)` starts a worker on a queue in its client's namespace (`client.Dial` `Namespace`). A namespace or queue read from config or the environment cannot be resolved from code: ask, or leave it to the stitch's topology.
- The types registered on one worker make one `worker` block ([worker.md](./worker.md#registration)), annotated `@sdk(go, "<path>")` with the file that registers them. A `RegisterXxxTypes(r worker.Registry)` helper is that set, shared by the worker process and its tests: `RegisterApprovalTypes` is `worker approvalTypes`, and its file is the path. With no `worker.New` calling it in the slice, there is no namespace or queue to recover.
- `RegisterWorkflow(fn)` registers the function's name; `RegisterActivity(&S{})` every exported method of `S`. `…WithOptions` with `Name` overrides the name, or prefixes a struct's methods.
- `RegisterDynamicWorkflow` / `RegisterDynamicActivity`, which serve any type name at runtime, and an update's `UpdateHandlerOptions.Validator` ([update-handler.md](./update-handler.md)) have no `.twf` form: record each in prose with its `file:line`.
- `GetSignalChannel(ctx, name)`, `SetQueryHandler(ctx, name, fn)` and `SetUpdateHandler(ctx, name, fn)` declare a `signal`, `query` or `update` of the enclosing workflow; `name`, often a constant, is its `.twf` name. Its params are the `Receive` target's fields or `fn`'s params after any leading `workflow.Context`, its result `fn`'s, and an update's body `fn`'s statements less the queue's `xs.add`. The `…WithOptions` forms carry `description`, and an update's `UnfinishedPolicy` its `unfinished_policy`.
- A queue built from an instance key (`"sandbox-"+id`) is a [family](./worker.md#per-instance-worker-families) worker.
- `nexus.NewService(name)` + `service.Register(ops…)` (or `MustRegister`) + `RegisterNexusService(service)` is a Nexus service and its operations: `nexus.NewSyncOperation` a `sync` one, `temporalnexus.NewWorkflowRunOperation(name, W, …)`, or a `MustNewWorkflowRunOperationWithOptions` whose `Handler` starts `W` through `ExecuteUntypedWorkflow`, an `async` one backed by `W` ([nexus-service-def.md](./nexus-service-def.md)). A `Register` of only some of a service's operations is a forked contract.
- `workflow.NewNexusClient(endpoint, service)` names the endpoint and service of every `nexus` call made through it.
- DI wiring (fx, wire) hides `worker.New` behind providers; follow them to it.

## Concurrency

| Go | `.twf` |
|----|--------|
| a `workflow.Go` loop that `Receive`s from a signal channel | `signal` handler, its body the loop's statements less the queue's `xs.add` ([signal-handler.md](./signal-handler.md)) |
| a queue or counter a handler feeds (`arrivals.add`, `acks++`), taken from in the workflow (`take`) | `await signal\|update Name -> (…)` ([await-signal.md](./await-signal.md)) |
| a `wait` ticket and `workflow.NewFuture` settled by `takeAt` | `promise p <- signal\|update Name` ([promise.md](./promise.md)) |
| `workflow.Go` + futures joined, or `workflow.NewWaitGroup` | `await all` ([await-all.md](./await-all.md)) |
| `workflow.Await` on any of several ready checks (`xs.ready(t)`, `f.IsReady()`, a `bool`), then the first ready one in order wins | `await one`, cases in that order ([await-one.md](./await-one.md)) |
| `workflow.NewSelector` (legacy) | `await one`, with a comment that the first event wins, not the first listed |
| `Receive`, or a selector's `AddReceive`, on a signal channel no handler loop reads (legacy) | `await signal`, or that `await one` case; the code's handler does nothing, which a `.twf` handler cannot say (it needs a statement), so record that in prose |
| future held, `.Get` later | `promise` ([promise.md](./promise.md)) |
| `.Get` right after the call | synchronous call |
| `workflow.Await` on a `bool` | `condition` ([condition.md](./condition.md)) |
| `NewDisconnectedContext` + `PARENT_CLOSE_POLICY_ABANDON` + `GetChildWorkflowExecution().Get` | `detach workflow` ([detach.md](./detach.md)) |
| `NexusOperationCancellationTypeAbandon` + `GetNexusOperationExecution().Get` | `detach nexus` ([detach.md](./detach.md)) |
| `return workflow.NewContinueAsNewError(ctx, W, args…)` | `close continue_as_new(args)` ([close.md](./close.md)) |

## Codegen

- **Proto-driven** when any of: `buf.gen.yaml` with a `protoc-gen-go_temporal` plugin; `*_temporal.pb.go` files; `(temporal.v1.activity)` / `(temporal.v1.workflow)` annotations. Read the `.proto`, not the generated code; the [generated-symbol table](./proto-driven.md#generated-symbol-table) maps `XxxActivities`, `RegisterXxxActivities`, and `XxxFuture` back to the `activity` / `workflow`.
- `//go:generate` directives and Makefile targets name any other generator.
