# discovery

The TypeScript signals the design skill's [reverse engineering](../../temporal-architect-design/reference/reverse-engineering.md#language-signals) reads code by. Call sites read backward through the [reference index](../SKILL.md#reference-index): a `proxyActivities` property call is an `activity` call, `executeChild` a `workflow` call, `executeOperation` a `nexus` call. Paths below are in `@temporalio/*` source.

## Project roots

- A `package.json` that depends on `@temporalio/worker` or `@temporalio/workflow` marks a root that uses Temporal. Its `name`, else the repo path, is the path `twf mod init` takes; ask when neither fits. An npm, pnpm or yarn `workspaces` list joins several packages, each its own root.

## Registration

- `Worker.create({connection, namespace, taskQueue, …})` starts a worker on `taskQueue` in `namespace`, `'default'` when unset (`worker/src/worker-options.ts`). A namespace or queue read from config or the environment (`@temporalio/envconfig`'s `loadClientConnectConfig`, `process.env`) cannot be resolved from code: ask, or leave it to the stitch's topology.
- The types one `Worker.create` registers make one `worker` block ([worker.md](./worker.md#registration)), annotated `@sdk(typescript, "<path>")` with the file that registers them. A registrations helper returning `Pick<WorkerOptions, …>` is that set, shared by the worker process and its tests: `approvalTypes()` is `worker approvalTypes`, and its file is the path. With no `Worker.create` spreading it in the slice, there is no namespace or queue to recover; a test's `Worker.create` gives the test's queue, not the deployment's.
- Workflows are every function the `workflowsPath` module exports, or the module a `workflowBundle` was bundled from (`bundleWorkflowCode({workflowsPath})`), following re-exports; the export name is the `.twf` name (`mod[workflowType]`, `workflow/src/worker-interface.ts`). A `default` export serves every unmatched type (same file) and has no `.twf` form: record it in prose with its `file:line`.
- Activities are the `activities` object's keys: a factory's returned object ([activity-def.md](./activity-def.md)), or a module's exports.
- `defineSignal`, `defineQuery` or `defineUpdate('Name')` plus a `setHandler` in a workflow function declare a `signal`, `query` or `update` of that workflow; the string is its `.twf` name. Its params are the definition's tuple (or the handler's params), its result the query's or update's `Ret`, and its body the handler's statements less the `xs.add`. The `let`s the handlers and the workflow share are its `state:`. The options' `description` and `unfinishedPolicy` give `description` and `unfinished_policy`.
- An update's `validator` option and `setDefaultSignalHandler`, `setDefaultUpdateHandler` and `setDefaultQueryHandler`, which serve any name at runtime (`workflow/src/workflow.ts`), have no `.twf` form: record each in prose with its `file:line`.
- A queue built from an instance key (`` `sandbox-${id}` ``) is a [family](./worker.md#per-instance-worker-families) worker.
- Each `nexusServices` entry, a `nexus.serviceHandler(Svc, {…})`, is a Nexus service on that worker. `nexus.service('Name', {Op: nexus.operation<I, O>()})` names it and its operations, each by its key unless `operation({name})` replaces it. A `WorkflowRunOperationHandler` whose `startWorkflow` starts `W` is an `async` operation backed by `W`; a plain `async (ctx, input)` handler a `sync` one ([nexus-service-def.md](./nexus-service-def.md)).
- `createNexusServiceClient({endpoint, service})` names the endpoint and service of every `nexus` call made through it.
- A `Worker.create` behind a config loader or DI container: follow it to the call.

## Concurrency

| TypeScript | `.twf` |
|------------|--------|
| `setHandler` whose body ends with `xs.add(…)` on an `Arrivals` | handler, its body less the `xs.add` ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)) |
| `await xs.take()` | `await signal\|update Name -> (…)` ([await-signal.md](./await-signal.md)) |
| `const p = xs.take()`, awaited later | `promise p <- signal\|update Name` ([promise.md](./promise.md)) |
| `Promise.all([…])`; over `xs.map(…)` | `await all`, branches in array order; a `for` fan-out inside ([await-all.md](./await-all.md)) |
| `xs.wait()` tickets and settled flags, one `condition` over all of them, then the first ready one in check order wins (`claim`, `leave`) | `await one`, cases in that order ([await-one.md](./await-one.md)) |
| `condition(c, timeout)` | `await one` with a `c` case and a `timer(timeout)` case; it is a `Promise.race` inside (`workflow/src/workflow.ts`), so it ties as below |
| `Promise.race([…])` | `await one`, with a comment that the first to settle wins, not the first listed |
| a `Trigger` resolved in a handler, awaited in the workflow | handler + `promise p <- signal Name`, with a comment that it is one-shot: later arrivals are dropped (`workflow/src/trigger.ts`) |
| `await condition(() => flag)` on a `let` boolean | `condition` ([condition.md](./condition.md)) |
| un-awaited `Promise` held, awaited later | `promise` ([promise.md](./promise.md)) |
| `await` on the call itself | synchronous call |
| `startChild` with `ParentClosePolicy.ABANDON`, `.result()` never read | `detach workflow`; without `ChildWorkflowCancellationType.ABANDON` the caller's cancellation still reaches it, so record that in prose ([detach.md](./detach.md)) |
| `getClient().workflow.start` in a sync Nexus handler, `.result()` never read | `detach workflow` ([detach.md](./detach.md)) |
| `startOperation` with `NexusOperationCancellationType.ABANDON`, `.result()` never read | `detach nexus` ([detach.md](./detach.md)) |
| `continueAsNew<typeof W>(args…)`, or a `makeContinueAsNewFunc` result called | `close continue_as_new(args)` ([close.md](./close.md)) |
| `sleep(d)` | `await timer(d)` ([await-timer.md](./await-timer.md)) |

## Codegen

- No forward variant generates code ([SKILL.md](../SKILL.md#orient)).
- A `nexus.service` contract module generated by `nexgen` from a JSON or YAML definition (`*.nexusrpc.yaml`; docs.temporal.io, TypeScript Nexus feature guide): read the definition, not the module, for the `nexus service` and its operations.
- `DefaultPayloadConverterWithProtobufs` (`common/src/converter/protobuf-payload-converters.ts`) with generated `protobufjs` modules: the payload types come from the `.proto`.
- `package.json` scripts name any other generator.
