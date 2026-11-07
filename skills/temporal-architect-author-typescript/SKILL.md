---
name: temporal-architect-author-typescript
description: Generate TypeScript code from .twf workflow designs using the Temporal TypeScript SDK. Use when implementing workflows defined in TWF, producing type-checked TypeScript projects from DSL specifications.
---

# Temporal Architect: TypeScript Authoring

Turn `.twf` files into TypeScript that type-checks, runs, and implements the design with the Temporal TypeScript SDK. The deliverable is always `.ts` files.

## Orient

The mapping relies on TypeScript SDK `1.25` (`@temporalio/*`, every package at the same exact version) on Node 24, as the corpus pins them; on an older minor, check a call shape against that version's source before using it.

Settle where the code lands. The project root is the directory whose `package.json` depends on `@temporalio/worker`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. Paths below are in `@temporalio/*` and `nexus-rpc` source.

| Construct | TypeScript default | Set the `.twf` name by |
|---|---|---|
| workflow | the export's name in the worker's workflows module (`mod[workflowType]`, `workflow/src/worker-interface.ts`); a caller sends the function's `name` (`common/src/workflow-options.ts`) | naming the exported function as the `.twf` does, never through an aliased export |
| activity | the key in `Worker.create({activities})` (`worker/src/worker-options.ts`); a caller sends the `proxyActivities` property name (`workflow/src/workflow.ts`) | naming the exported function as the `.twf` does |
| signal | none: `defineSignal(name)` (`workflow/src/workflow.ts`) | a `name` equal to the `.twf` name |
| query | none: `defineQuery(name)` (`workflow/src/workflow.ts`) | a `name` equal to the `.twf` name |
| update | none: `defineUpdate(name)` (`workflow/src/workflow.ts`) | a `name` equal to the `.twf` name |
| Nexus service | none: `nexus.service(name, …)` (`nexus-rpc/lib/service/helpers.d.ts`) | a `name` equal to the `.twf` name |
| Nexus operation | the property key in the `nexus.service` map, unless `nexus.operation({name})` replaces it (`nexus-rpc/lib/service/helpers.js`) | a key equal to the `.twf` name, with `name` unset |

Types map by TypeScript's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ TypeScript translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. How to write TypeScript Temporal code well belongs to Temporal's official `temporal-developer` skill, pinned at `v0.6.3`; load it for these topics:

| Topic | `temporal-developer` |
|---|---|
| worker setup | `references/typescript/typescript.md` § Worker Setup, `gotchas.md` § Bundling Issues |
| testing | `references/typescript/testing.md` |
| determinism | `references/typescript/determinism.md`, `determinism-protection.md` |
| errors | `references/typescript/error-handling.md` |
| data | `references/typescript/data-handling.md` |
| versioning | `references/typescript/versioning.md` |

If it is not installed, install it from https://github.com/temporalio/skill-temporal-developer at `v0.6.3`, or read the topic's file there.

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working TypeScript.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripe` package (official, matches your existing dependency) or plain `fetch` (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, `package.json`, `tsconfig.json`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known packages when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Interfaces and exported signatures with stub bodies; interfaces shaped by the dependency map | `npx tsc --noEmit` |
| 1b. Activity stubs | Every activity exported with its real signature, so workflows call it through `proxyActivities` | `npx tsc --noEmit` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `npx tsc --noEmit` |
| 3. Activity impl | Thin exported functions + concrete implementations behind interfaces | `npx tsc --noEmit` |
| 4. Worker wiring | Each worker's registrations helper; the process builds dependencies, passes it to `Worker.create`, and runs | `npx tsc --noEmit`, `twf check` |
| 5. Tests | Floor: one happy-path test per workflow under `TestWorkflowEnvironment.createTimeSkipping()`, since designs wait minutes to hours, its worker built from the registrations helper | `npm test` |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `// TODO:` naming the elided logic (e.g. `// TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root:

```sh
npx tsc --noEmit && npm test
```

## Output conventions

- One workflows module per `.twf` worker: a worker registers every export of its `workflowsPath` module (`workflow/src/worker-interface.ts`), so two workers never share one.
- Each `.twf` worker's entry file exports a registrations helper named for the worker (`callerTypes()`), returning its `workflowsPath`, `activities` and `nexusServices` as a `Pick<WorkerOptions, …>`, shared by the worker process and the tests. Its `@sdk(typescript, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(typescript, "typescript/worker.ts")`.

## Reference index

Load only what the current layer needs.

| DSL | TypeScript | File |
|-----|------------|------|
| `workflow Name(...)` | exported `async` function in the worker's workflows module | [workflow-def.md](./reference/workflow-def.md) |
| `id_scheme: "..."` | ID function, called by every start and sender | [workflow-def.md](./reference/workflow-def.md#id_scheme) |
| `workflow_id_reuse_policy` / `workflow_id_conflict_policy` | start-options function; child gets reuse only | [options.md](./reference/options.md#workflow-id-policies) |
| `activity Name(...)` | `async` function from a `createActivities(deps)` factory | [activity-def.md](./reference/activity-def.md) |
| types (`int`, `time`, `bytes`, …), user types | what the JSON payload converter round-trips; `interface` | [types.md](./reference/types.md) |
| activity dependencies | dependency map, confirmed from `.d.ts` | [dependency-resolution.md](./reference/dependency-resolution.md) |
| `worker`, namespace worker `options:` | registrations helper, `Worker.create`, `WorkerOptions` | [worker.md](./reference/worker.md) |
| `nexus service Name:`, `async` / `sync` operations | `nexus.service` / `nexus.serviceHandler`; `WorkflowRunOperationHandler` / plain handler | [nexus-service-def.md](./reference/nexus-service-def.md) |
| `activity Name(args) -> r` | `proxyActivities` | [activity-call.md](./reference/activity-call.md) |
| `workflow Name(args) -> r` | `executeChild` | [workflow-call.md](./reference/workflow-call.md) |
| `detach workflow ...` / `detach nexus ...` | `startChild` / `startOperation` with `ABANDON`, skip result | [detach.md](./reference/detach.md) |
| `nexus Endpoint Service.Op(args) -> r` | `createNexusServiceClient(...).executeOperation` | [nexus.md](./reference/nexus.md) |
| `signal handle.Name(args)` / `signal Type.Name(args)` + `id:` | `ChildWorkflowHandle.signal` / `getExternalWorkflowHandle(...).signal` | [signal-send.md](./reference/signal-send.md) |
| `await timer(d)` | `sleep` | [await-timer.md](./reference/await-timer.md) |
| `options:` / `default_options:` | `ActivityOptions` / `ChildWorkflowOptions` / `StartNexusOperationOptions` | [options.md](./reference/options.md) |
| `if` / `for` / `switch` / `break` / `continue`, `x = expr` | TypeScript equivalents | [control-flow.md](./reference/control-flow.md) |
| `close complete` / `fail` / `continue_as_new` | `return` / `throw ApplicationFailure` / `continueAsNew` | [close.md](./reference/close.md) |
| `heartbeat(details)` | `heartbeat` from `@temporalio/activity` | [heartbeat.md](./reference/heartbeat.md) |

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: a child start is `await startChild(W, {…, parentClosePolicy: ParentClosePolicy.ABANDON})`, which resolves once the child starts, so a failed start fails the caller (`workflow/src/workflow.ts`). A client start just starts. Neither touches `.result()`.
- **`detach nexus`**: `await client.startOperation(op, input, {cancellationType: NexusOperationCancellationType.ABANDON})`, which resolves once the operation starts (a sync operation starts by completing) and never calls `.result()` (`workflow/src/nexus.ts`). After the caller closes, the operation's completion callback to it fails and is dropped.
