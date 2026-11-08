---
name: temporal-architect-author-swift
description: Generate Swift code from .twf workflow designs using the Swift Temporal SDK (apple/swift-temporal-sdk). Use when implementing workflows defined in TWF, producing built and tested Swift packages from DSL specifications.
---

# Temporal Architect: Swift Authoring

Turn `.twf` files into Swift that builds, runs, and implements the design with the Swift Temporal SDK. The deliverable is always `.swift` files.

## Orient

The mapping relies on `apple/swift-temporal-sdk` `1.5.0` (products `Temporal` and `TemporalTestKit`, one package) on Swift 6.2 (`swift-tools-version: 6.2`, `Package.swift:1`), for macOS 15+ (`Package.swift:18-21`) or Linux (`README.md:13`), as the corpus pins them; on another version, check a call shape against that version's source before using it. sdk-core arrives as a prebuilt bridge binary from the SDK's release `temporal-sdk-core-6e90e6d` (`Package.swift:62-71`): no Rust toolchain. Paths in this skill are in the SDK's source at `1.5.0` (`Sources/`) unless they name another root.

The SDK is maintained by Apple, not Temporal. It has no Nexus: its worker does not poll Nexus tasks (`Temporal/Bridge/WorkerClient/BridgeWorker+OptionsInit.swift:60`), it ignores Nexus resolutions (`Temporal/Worker/Workflow/WorkflowInstance.swift:406-409`), and `WorkflowContext` has no Nexus call. A design whose Swift worker registers a Nexus service, or whose Swift workflow calls one, cannot be authored in Swift; put that service or caller on a worker in another SDK.

Settle where the code lands. The project root is the directory whose `Package.swift` depends on `swift-temporal-sdk`; an Xcode project with that package reference is one too. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written over the SDK's macros: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. Paths below are in `Temporal/Worker/Workflow/`.

| Construct | Swift default | Set the `.twf` name by |
|---|---|---|
| workflow | the `@Workflow` struct's name (`WorkflowDefinition.swift:101-103`) | naming the struct as the `.twf` does, else `@Workflow(name:)` (`TemporalMacros/WorkflowMacro.swift:43-53`) |
| activity | the `@Activity` method name, first letter capitalized (`TemporalMacros/ActivityContainerMacro.swift:119`, `TemporalMacros/String+Capitalized.swift:16-25`) | naming the method as the `.twf` does in lowerCamel (`chargeCard` registers `ChargeCard`), else `@Activity(name:)` |
| signal | the `@WorkflowSignal` method name, first letter capitalized: the struct the macro nests (`TemporalMacros/WorkflowSignalMacro.swift:94,113`) names it (`WorkflowSignalDefinition.swift:102-104`) | naming the method in lowerCamel, else `@WorkflowSignal(name:)` (`:84-86`) |
| query | the `@WorkflowQuery` method or property name, first letter capitalized (`TemporalMacros/WorkflowQueryMacro.swift:119,132,190,194`; `WorkflowQueryDefinition.swift:97-99`) | naming the method or property in lowerCamel, else `@WorkflowQuery(name:)` (`:111-112,182-183`) |
| update | the `@WorkflowUpdate` method name, first letter capitalized (`TemporalMacros/WorkflowUpdateMacro.swift:90,146`; `WorkflowUpdateDefinition.swift:109-111`) | naming the method in lowerCamel, else `@WorkflowUpdate(name:)` (`:79-80`) |
| Nexus service | unsupported ([Orient](#orient)) | a worker in another SDK |
| Nexus operation | unsupported ([Orient](#orient)) | a worker in another SDK |

So a PascalCase `.twf` name needs no `name:`: the idiomatic lowerCamel method reproduces it. A `.twf` name that does not start with an uppercase letter always needs `name:`. The macro names its nested struct from the method even when `name:` is set, so a method whose capitalized name collides with another type in scope (`Input`, `Output`, a declared struct, the container's generated `Activities`, `TemporalMacros/ActivityContainerMacro.swift:139,157`) is renamed and takes `name:`.

Types map by Swift's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Swift translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. Temporal's official `temporal-developer` skill has no Swift coverage, so how to write Swift Temporal code well belongs to the SDK's own DocC catalog and `Examples/` at `1.5.0`, plus [versioning.md](./reference/versioning.md), the one topic they leave to symbol docs:

| Topic | Source |
|---|---|
| worker setup | [`GettingStarted.md` § Start a worker and client](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/GettingStarted.md#start-a-worker-and-client), [`Connecting-to-Temporal.md`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Connecting-to-Temporal.md), [`Examples/Greeting`](https://github.com/apple/swift-temporal-sdk/tree/1.5.0/Examples/Greeting) |
| testing | [`Testing-Workflows.md`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Testing/Testing-Workflows.md), [`Testing-Activities.md`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Testing/Testing-Activities.md) |
| determinism | [`Workflow-Concurrency.md` § Understand deterministic execution guarantees](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#understand-deterministic-execution-guarantees), [§ Use safe APIs for deterministic execution](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#use-safe-apis-for-deterministic-execution) |
| errors | [`Examples/ErrorHandling`](https://github.com/apple/swift-temporal-sdk/tree/1.5.0/Examples/ErrorHandling) |
| data | [`Working-with-Data.md`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Working-with-Data.md) |
| versioning | [versioning.md](./reference/versioning.md) |

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Swift.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripe-swift` package (matches your existing dependency) or plain `AsyncHTTPClient` (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, `Package.swift`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known packages when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | `Codable` structs; each `@Workflow` struct with its one-`input` `run` and a stub body (`WorkflowDefinition.swift:98`) | `swift build --build-tests` |
| 1b. Activity stubs | Every `@ActivityContainer` with its real `@Activity` signatures, so workflows call them through `context.executeActivity` | `swift build --build-tests` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `swift build --build-tests` |
| 3. Activity impl | Container methods + concrete implementations held in the container's stored properties | `swift build --build-tests` |
| 4. Worker wiring | Each worker's `enum` in `Worker.swift`; the process builds dependencies and runs a `TemporalWorker` from it | `swift build --build-tests`, `twf check` |
| 5. Tests | Floor: one happy-path Swift Testing test per workflow under the TestKit's time-skipping server (`TemporalTestKit/TemporalTestServer.swift:235,762`), since designs wait minutes to hours, its worker built from the worker's `enum`. sdk-core downloads that server at test time (`Temporal/Bridge/BridgeTestServer.swift:42-51`), so the first run needs network | [Verify](#verify) |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `// TODO:` naming the elided logic (e.g. `// TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the package root, with `.treatAllWarnings(as: .error)` in each target's `swiftSettings`:

```sh
swift build --build-tests --force-resolved-versions && swift test --skip-build
```

## Output conventions

- One SwiftPM target (module) per `.twf` package; a qualified reference imports the other package's module.
- Each `.twf` worker is an `enum` named for the worker (`enum ApprovalTypes`) in one `Worker.swift` per design: its `workflows`, `activities` and `configuration(…)` feed `TemporalWorker`'s `workflows:`, `activities:`/`activityContainers:` and `configuration:` (`Temporal/Worker/TemporalWorker.swift:90-96`), shared by the worker process and the tests. Its `@sdk(swift, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(swift, "Sources/Approvals/Worker.swift")`.

## Reference index

Load only what the current layer needs.

| DSL | Swift | File |
|-----|------|------|
| `workflow Name(...)` | `@Workflow struct` with `run(context:input:)`; several params are one `Codable` input | [workflow-def.md](./reference/workflow-def.md) |
| `id_scheme: "..."` | `static func id(…)` on the workflow struct, passed as `id:` by every start and sender | [workflow-def.md](./reference/workflow-def.md#id_scheme) |
| `workflow_id_reuse_policy` / `workflow_id_conflict_policy` | `WorkflowOptions` / `ChildWorkflowOptions` fields; a child gets reuse only | [options.md](./reference/options.md#workflow-id-policies) |
| `activity Name(...)` | `@Activity` method on an `@ActivityContainer` struct holding its dependencies | [activity-def.md](./reference/activity-def.md) |
| types (`int`, `time`, `bytes`, …), user types | what the default converter round-trips; `Codable` struct | [types.md](./reference/types.md) |
| activity dependencies | dependency map, confirmed from the resolved package | [dependency-resolution.md](./reference/dependency-resolution.md) |
| `worker`, namespace worker `options:` | the worker's `enum` in `Worker.swift`, `TemporalWorker.Configuration` | [worker.md](./reference/worker.md) |
| `nexus service Name:`, `async` / `sync` operations | unsupported | [nexus-service-def.md](./reference/nexus-service-def.md) |
| `activity Name(args) -> r` | `context.executeActivity(Acts.Activities.Name.self, options:, input:)` | [activity-call.md](./reference/activity-call.md) |
| `workflow Name(args) -> r` | `context.executeChildWorkflow(W.self, options:, input:)` | [workflow-call.md](./reference/workflow-call.md) |
| `detach workflow ...` / `detach nexus ...` | `startChildWorkflow` with both `.abandon`s, never `result()`; Nexus unsupported | [detach.md](./reference/detach.md) |
| `nexus Endpoint Service.Op(args) -> r` | unsupported | [nexus.md](./reference/nexus.md) |
| `signal Name(params):` | `@WorkflowSignal` method: body, then the arrival is added | [signal-handler.md](./reference/signal-handler.md) |
| `query Name(params) -> (T):` | `@WorkflowQuery` method or property | [query-handler.md](./reference/query-handler.md) |
| `update Name(params) -> (T):` | `@WorkflowUpdate` method: body, then the arrival is added, then `return` | [update-handler.md](./reference/update-handler.md) |
| `await signal\|update Name -> (...)` | `try await context.take(\.arrivals)` | [await-signal.md](./reference/await-signal.md) |
| `promise p <- ...` | `async let`; for a signal or update, a ticket begun at the binding, then `async let` | [promise.md](./reference/promise.md) |
| `state:` / `condition` / `set` / `unset` | stored `var` of the workflow struct + `context.condition` | [condition.md](./reference/condition.md) |
| `await all:` | `async let` pair or `withThrowingTaskGroup` | [await-all.md](./reference/await-all.md) |
| `await one:` | one `context.condition` over every case, then a listed-order check; first listed ready wins | [await-one.md](./reference/await-one.md) |
| handler + condition + `await one` | worked compositions | [composite-patterns.md](./reference/composite-patterns.md) |
| `signal handle.Name(args)` / `signal Type.Name(args)` + `id:` | the child handle's `signalWorkflow` / `context.getExternalWorkflowHandle(…)`'s | [signal-send.md](./reference/signal-send.md) |
| `await timer(d)` | `try await context.sleep(for:)`, never `Task.sleep` | [await-timer.md](./reference/await-timer.md) |
| `options:` / `default_options:` | `ActivityOptions` / `ChildWorkflowOptions` on the call; a `static let` per workflow | [options.md](./reference/options.md) |
| `if` / `for` / `switch` / `break` / `continue`, `x = expr` | Swift equivalents | [control-flow.md](./reference/control-flow.md) |
| `close complete` / `fail` / `continue_as_new` | `return` / `throw ApplicationError` / `throw context.makeContinueAsNewError` | [close.md](./reference/close.md) |
| `heartbeat(details)` | `ActivityExecutionContext.current` heartbeat | [heartbeat.md](./reference/heartbeat.md) |
| patching, worker versioning | `context.patch` / `deprecatePatch`; `VersioningStrategy` | [versioning.md](./reference/versioning.md) |
| recovered `.twf` (code → `.twf`) | project roots, registration, concurrency, codegen | [discovery.md](./reference/discovery.md) |

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: `_ = try await context.startChildWorkflow(W.self, options: ChildWorkflowOptions(parentClosePolicy: .abandon, cancellationType: .abandon), input: …)`, so neither the caller's close nor its cancellation reaches the child (defaults `.terminate` and `.waitCancellationCompleted`, `Temporal/Worker/Workflow/ChildWorkflowOptions.swift:197,200`; `Temporal/Worker/Workflow/ChildWorkflowCancellationType.swift:53`). It returns once the start resolves, so a failed start throws in the caller (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:357-386`). A client start (`client.startWorkflow`, `Temporal/Client/TemporalClient+WorkflowHandle.swift:46`) just starts. Neither calls the handle's `result()`.
- **`detach nexus`**: unsupported: the SDK has no Nexus ([Orient](#orient)).
