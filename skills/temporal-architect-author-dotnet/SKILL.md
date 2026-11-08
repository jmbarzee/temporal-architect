---
name: temporal-architect-author-dotnet
description: Generate C# code from .twf workflow designs using the Temporal .NET SDK. Use when implementing workflows defined in TWF, producing compiled and tested .NET projects from DSL specifications.
---

# Temporal Architect: .NET Authoring

Turn `.twf` files into C# that builds, runs, and implements the design with the Temporal .NET SDK. The deliverable is always `.cs` files.

## Orient

The mapping relies on .NET SDK `1.21` (`Temporalio`) on .NET 10 (`net10.0`), as the corpus pins them; on an older minor, check a call shape against that version's source before using it.

Settle where the code lands. The project root is the directory whose `.csproj` references `Temporalio`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. Paths below are in `Temporalio` (`src/Temporalio/`) and `NexusRpc` (`src/NexusRpc/`) source.

| Construct | .NET default | Set the `.twf` name by |
|---|---|---|
| workflow | the `[Workflow]` type's name, not its `[WorkflowRun]` method's; on an interface, a leading `I` trimmed before a capital (`Workflows/WorkflowDefinition.cs:160-166`) | naming the class as the `.twf` does, else `[Workflow("Name")]` |
| activity | the method name, `Async` trimmed when it returns a `Task` (`Activities/ActivityDefinition.cs:277,298-301`) | naming the method as the `.twf` does, else `[Activity("Name")]` |
| signal | the method name, `Async` trimmed (`Workflows/WorkflowSignalDefinition.cs:131-136`) | naming the method as the `.twf` does, else `[WorkflowSignal("Name")]` |
| query | the method or property name as is (`Workflows/WorkflowQueryDefinition.cs:110,167`) | naming the member as the `.twf` does, else `[WorkflowQuery("Name")]` |
| update | the method name, `Async` trimmed (`Workflows/WorkflowUpdateDefinition.cs:161-166`) | naming the method as the `.twf` does, else `[WorkflowUpdate("Name")]` |
| Nexus service | the `[NexusService]` interface's name, a leading `I` trimmed before a capital (`ServiceDefinition.cs:61-68`) | naming the interface `I` + the `.twf` name, else `[NexusService("Name")]` |
| Nexus operation | the method name as is (`OperationDefinition.cs:59`) | naming the method as the `.twf` does, else `[NexusOperation("Name")]` |

Types map by .NET's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ .NET translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. How to write .NET Temporal code well belongs to Temporal's official `temporal-developer` skill, pinned at `v0.6.3`; load it for these topics:

| Topic | `temporal-developer` |
|---|---|
| worker setup | `references/dotnet/dotnet.md` § Worker Setup, § File Organization Best Practice |
| testing | `references/dotnet/testing.md` |
| determinism | `references/dotnet/determinism.md`, `determinism-protection.md`, `gotchas.md` § .NET Task Determinism |
| errors | `references/dotnet/error-handling.md` |
| data | `references/dotnet/data-handling.md` |
| versioning | `references/dotnet/versioning.md` |

If it is not installed, install it from https://github.com/temporalio/skill-temporal-developer at `v0.6.3`, or read the topic's file there.

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working C#.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `Stripe.net` package (official, matches your existing dependency) or plain `HttpClient` (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, the `.csproj`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known packages when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Records and `[Workflow]` classes with stub bodies; interfaces shaped by the dependency map | `dotnet build` |
| 1b. Activity stubs | Every `[Activity]` method with its real signature, so workflows call it through `Workflow.ExecuteActivityAsync` | `dotnet build` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `dotnet build` |
| 3. Activity impl | Thin `[Activity]` methods + concrete implementations behind interfaces | `dotnet build` |
| 4. Worker wiring | Each worker's registrations extension method; the process builds dependencies, applies it to `TemporalWorkerOptions`, and runs | `dotnet build`, `twf check` |
| 5. Tests | Floor: one happy-path test per workflow under `WorkflowEnvironment.StartTimeSkippingAsync()`, since designs wait minutes to hours, its worker built from the registrations extension method | `dotnet test` |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `// TODO:` naming the elided logic (e.g. `// TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root:

```sh
dotnet test
```

## Output conventions

- One C# namespace (and directory) per `.twf` package.
- Workflow files take [the `.workflow.cs` suffix](https://github.com/temporalio/skill-temporal-developer/blob/v0.6.3/references/dotnet/dotnet.md#workflow-editorconfig).
- Each `.twf` worker has a registrations extension method named for the worker (`AddApprovalTypes(this TemporalWorkerOptions options)`), adding its workflows, activities and Nexus services (`Worker/TemporalWorkerOptions.cs:414-503`), shared by the worker process and the tests. Its `@sdk(dotnet, "<path>")` names that method's file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(dotnet, "dotnet/Worker.cs")`.

## Reference index

Load only what the current layer needs.

| DSL | .NET | File |
|-----|------|------|

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: a child start is `await Workflow.StartChildWorkflowAsync(…, new() { ParentClosePolicy = ParentClosePolicy.Abandon, CancellationType = ChildWorkflowCancellationType.Abandon })`, so neither the caller's close nor its cancellation reaches the child (`Workflows/ParentClosePolicy.cs:21`, `Workflows/ChildWorkflowCancellationType.cs:8-11`); it resolves once the child starts, so a failed start fails the caller (`Worker/WorkflowInstance.cs:2691-2741`). A client start just starts. Neither calls `GetResultAsync()`.
- **`detach nexus`**: `await client.StartNexusOperationAsync(svc => svc.Op(input), new() { CancellationType = NexusOperationCancellationType.Abandon })` (`Workflows/NexusOperationCancellationType.cs:16`), which resolves once the operation starts (a sync operation starts by completing) and never calls `GetResultAsync()` (`Worker/WorkflowInstance.cs:2906-2926`). After the caller closes, the operation's completion callback to it fails and is dropped.
