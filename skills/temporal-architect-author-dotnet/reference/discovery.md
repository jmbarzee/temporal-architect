# discovery

The .NET signals the design skill's [reverse engineering](../../temporal-architect-design/reference/reverse-engineering.md#language-signals) reads code by. Call sites read backward through the [reference index](../SKILL.md#reference-index): a `Workflow.ExecuteActivityAsync` is an `activity` call, `Workflow.ExecuteChildWorkflowAsync` a `workflow` call, `ExecuteNexusOperationAsync` a `nexus` call. Names read back through [Wire names](../SKILL.md#wire-names). Paths below are in `Temporalio` (`src/Temporalio/`) and `Temporalio.Extensions.Hosting` (`src/Temporalio.Extensions.Hosting/`) source.

## Project roots

- A `.csproj` with a `PackageReference` to `Temporalio` or `Temporalio.Extensions.Hosting` (its version in `Directory.Packages.props` under central package management) marks a root that uses Temporal. Its `RootNamespace`, else the project's file name, else the repo path, is the path `twf mod init` takes; ask when none fits. A `.sln` or `.slnx` joins several projects, each its own root; a test project referencing a code project is not a root of its own.

## Registration

- `new TemporalWorker(client, new TemporalWorkerOptions("q")…)` starts a worker on `q` in the client's namespace, `TemporalClientConnectOptions.Namespace`, `"default"` when unset (`Client/TemporalClientConnectOptions.cs:40`). A namespace or queue read from config or the environment (`ClientEnvConfig.LoadClientConnectOptions()`, `Common/EnvConfig/ClientEnvConfig.cs:32`; `IConfiguration`; `Environment.GetEnvironmentVariable`) cannot be resolved from code: ask, or leave it to the stitch's topology.
- The types one `TemporalWorkerOptions` registers make one `worker` block ([worker.md](./worker.md#registration)), annotated `@sdk(dotnet, "<path>")` with the file that registers them. A registrations extension method is that set, shared by the worker process and its tests: `AddApprovalTypes` is `worker approvalTypes`, and its file is the path. With no `TemporalWorker` applying it in the slice, there is no namespace or queue to recover; a test's worker gives the test's queue, not the deployment's, and workflows only a test registers are fixtures, not the design.
- `AddWorkflow<T>()` registers the `[Workflow]` class `T`; `AddActivity(Activities.Compose)` one `[Activity]` method; `AddAllActivities(instance)` every `[Activity]` method of the instance's class (`Worker/TemporalWorkerOptions.cs:414-467`).
- **Hosting.** `services.AddHostedTemporalWorker(host, ns, "q")` is a worker on `q` in `ns`; `AddHostedTemporalWorker("q")` takes the client from `AddTemporalClient(host, ns)` (`TemporalHostingServiceCollectionExtensions.cs:107,133,175`). Its set is the builder's `AddWorkflow<T>()`, `AddScopedActivities<T>()`, `AddSingletonActivities<T>()`, `AddTransientActivities<T>()`, `AddStaticActivities<T>()` and `AddActivitiesInstance(…)` (each every `[Activity]` method of `T`), and `AddScoped|Singleton|TransientNexusService<T>()` (`TemporalWorkerServiceOptionsBuilderExtensions.cs:25-256`), plus any registrations method in `.ConfigureOptions(o => o.AddXxxTypes(…))`.
- A `[WorkflowSignal]`, `[WorkflowUpdate]` or `[WorkflowQuery]` member of a workflow class declares a `signal`, `update` or `query` of that workflow. Its params are the method's, positional, its result the update's or query's `T`, and its body the handler's statements less the `xs.Add`. The fields the handlers and the run method share are its `state:`. The attribute's `Description` and `UnfinishedPolicy` give `description` and `unfinished_policy`.
- A `[WorkflowUpdateValidator]` (`Workflows/WorkflowUpdateValidatorAttribute.cs:13`), and `Dynamic = true` on `[Workflow]`, `[Activity]`, `[WorkflowSignal]`, `[WorkflowUpdate]` or `[WorkflowQuery]` (`Workflows/WorkflowSignalAttribute.cs:52`, and each sibling attribute's `Dynamic`), which serves any unmatched name at runtime, have no `.twf` form: record each in prose with its `file:line`.
- A queue built by an instance-key function (`SandboxQueue(sandboxId)` → `$"sandbox-{sandboxId}"`) is a [family](./worker.md#per-instance-worker-families) worker.
- Each `AddNexusService(new Handler())` (`Worker/TemporalWorkerOptions.cs:491`) is a Nexus service on that worker: the `[NexusServiceHandler(typeof(IService))]` class names its contract, a `[NexusService]` interface whose `[NexusOperation]` methods are the operations. A handler method returning `WorkflowRunOperationHandler.FromHandleFactory(…)` whose `ctx.StartWorkflowAsync` starts `W` is an `async` operation backed by `W`; one returning `OperationHandler.Sync(…)` a `sync` one, its body the lambda's ([nexus-service-def.md](./nexus-service-def.md)).
- `Workflow.CreateNexusWorkflowClient<IService>("Ep")` names the endpoint and service of every `nexus` call made through it; an endpoint from config cannot be resolved from code.
- A `TemporalWorker` built behind a DI container or factory: follow it to the construction.

## Concurrency

| C# | `.twf` |
|----|--------|
| `[WorkflowSignal]` / `[WorkflowUpdate]` method whose body ends with `xs.Add(…)` on an `Arrivals` | handler, its body less the `xs.Add` ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)); a counter it increments (`acks++`) and a waiter decrements once per take (`acks > 0` … `acks--`) is an `Arrivals<bool>`, while one never decremented, or reset, is plain `state:` |
| `await xs.TakeAsync()` | `await signal\|update Name -> (…)`, a tuple deconstructed into its names; `Arrivals<bool>` binds none ([await-signal.md](./await-signal.md)) |
| `var p = xs.TakeAsync()`, awaited later | `promise p <- signal\|update Name` ([promise.md](./promise.md)) |
| `Workflow.WhenAllAsync(…)`; over `items.Select(…)` | `await all`, branches in argument order; a `for` fan-out inside ([await-all.md](./await-all.md)) |
| one `Workflow.WaitConditionAsync` over `xs.Ready`, an arrivals counter (`acks > 0`), `p.IsCompleted` and `bool`s, then the first ready one in check order wins (`Claim()`, `acks--`, `await p`) | `await one`, cases in that order; a losing timer's token cancelled after is still `await one` ([await-one.md](./await-one.md)) |
| `WaitConditionAsync(c, timeout)` | `await one` with a `c` case and a `timer(timeout)` case, with a comment that it is a `WhenAny` inside (`Worker/WorkflowInstance.cs:650-668`), so the first to complete wins, not the first listed |
| `Workflow.WhenAnyAsync(…)` | `await one`, with a comment that the first to complete wins, not the first listed |
| a `bool` field set by a handler, awaited by `WaitConditionAsync(() => flag)` | `condition` + `set` ([condition.md](./condition.md)), with a comment that repeated arrivals collapse into one: it is no `await signal` |
| un-awaited `Task` held, awaited later | `promise` ([promise.md](./promise.md)) |
| `await` on the call itself | synchronous call |
| `StartChildWorkflowAsync` without `Abandon`, its handle signaled or its `GetResultAsync()` awaited | `promise p <- workflow` ([workflow-call.md](./workflow-call.md), [signal-send.md](./signal-send.md)) |
| `StartChildWorkflowAsync` with `ParentClosePolicy.Abandon`, `GetResultAsync()` never called | `detach workflow`; without `ChildWorkflowCancellationType.Abandon` the caller's cancellation still reaches it, so record that in prose ([detach.md](./detach.md)) |
| `client.StartWorkflowAsync` in a sync Nexus handler, `GetResultAsync()` never called | `detach workflow` ([detach.md](./detach.md)) |
| `StartNexusOperationAsync` with `NexusOperationCancellationType.Abandon`, `GetResultAsync()` never called | `detach nexus` ([detach.md](./detach.md)) |
| `throw Workflow.CreateContinueAsNewException((W wf) => wf.RunAsync(args…))` in `W` | `close continue_as_new(args)` ([close.md](./close.md)); onto another type, record it in prose |
| `await Workflow.DelayAsync(d)` | `await timer(d)` ([await-timer.md](./await-timer.md)) |

## Codegen

- No forward variant generates code ([SKILL.md](../SKILL.md#orient)).
- `Google.Protobuf` messages travel through the default converter's `JsonProtoConverter` and `BinaryProtoConverter` (`Converters/DefaultPayloadConverter.cs:60-66`): the payload types come from the `.proto` a `<Protobuf Include>` item compiles.
- `.csproj` items and tool manifests (`.config/dotnet-tools.json`) name any other generator.
