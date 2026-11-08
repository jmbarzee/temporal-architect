---
name: temporal-architect-author-java
description: Generate Java code from .twf workflow designs using the Temporal Java SDK. Use when implementing workflows defined in TWF, producing compiled and tested Java projects from DSL specifications.
---

# Temporal Architect: Java Authoring

Turn `.twf` files into Java that compiles, runs, and implements the design with the Temporal Java SDK. The deliverable is always `.java` files.

## Orient

The mapping relies on Java SDK `1.40` (`io.temporal:temporal-sdk` and `temporal-testing` at the same version) on JDK 21 compiling `--release 17`, built with Maven 3.9 through `mvnw`, as the corpus pins them; on an older minor, check a call shape against that version's source before using it.

Settle where the code lands. The project root is the directory whose `pom.xml` depends on `io.temporal:temporal-sdk`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. Paths below are in `temporal-sdk` (`io/temporal/`) and `nexus-sdk` (`io/nexusrpc/`) source.

| Construct | Java default | Set the `.twf` name by |
|---|---|---|
| workflow | the `@WorkflowInterface` interface's simple name, not its `@WorkflowMethod` method's (`common/metadata/POJOWorkflowMethodMetadata.java:27`) | naming the interface as the `.twf` does, with `name` unset |
| activity | the method name with its first letter capitalized, after `@ActivityInterface(namePrefix=)` (`common/metadata/POJOActivityMethodMetadata.java:21-30`) | naming the method as the `.twf` does in camelCase (`chargeCard` registers `ChargeCard`), with `namePrefix` unset, else `@ActivityMethod(name=…)` |
| signal | the method name as is (`common/metadata/POJOWorkflowMethodMetadata.java:29`) | `@SignalMethod(name=…)` |
| query | the method name as is (`common/metadata/POJOWorkflowMethodMetadata.java:29`) | `@QueryMethod(name=…)` |
| update | the method name as is (`common/metadata/POJOWorkflowMethodMetadata.java:29`) | `@UpdateMethod(name=…)` |
| Nexus service | the `@Service` interface's simple name (`ServiceDefinition.java:20`) | naming the interface as the `.twf` does, with `name` unset |
| Nexus operation | the method name as is (`OperationDefinition.java:27`) | `@Operation(name=…)` |

Set `name=` whenever the Java name differs from the `.twf` name: always for handlers and operations, whose camelCase methods never match a PascalCase `.twf` name; never for workflow and service interfaces, which are PascalCase in both, or for activities, whose default capitalizes the first letter. A missing `name=` registers the Java name silently.

Types map by Java's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Java translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. How to write Java Temporal code well belongs to Temporal's official `temporal-developer` skill, pinned at `v0.6.3`; load it for these topics:

| Topic | `temporal-developer` |
|---|---|
| worker setup | `references/java/java.md` § Worker Setup, § File Organization Best Practice |
| testing | `references/java/testing.md` |
| determinism | `references/java/determinism.md`, `determinism-protection.md` |
| errors | `references/java/error-handling.md` |
| data | `references/java/data-handling.md` |
| versioning | `references/java/versioning.md` |

If it is not installed, install it from https://github.com/temporalio/skill-temporal-developer at `v0.6.3`, or read the topic's file there.

The corpus uses `TestWorkflowEnvironment` directly, not `TestWorkflowExtension` (`testing.md` shows both), so a test can build and stop its own workers.

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Java.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripe-java` library (official, matches your existing dependency) or plain `java.net.http.HttpClient` (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, `pom.xml`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known libraries when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Records and `@WorkflowInterface` interfaces with stub impls; interfaces shaped by the dependency map | `./mvnw -B -q test-compile` |
| 1b. Activity stubs | Every `@ActivityInterface` method with its real signature, so workflows call it through `Workflow.newActivityStub` | `./mvnw -B -q test-compile` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `./mvnw -B -q test-compile` |
| 3. Activity impl | Thin impl classes + concrete implementations behind interfaces | `./mvnw -B -q test-compile` |
| 4. Worker wiring | Each worker's registrations method; the process builds dependencies, applies it to a `Worker` from `WorkerFactory.newWorker`, and starts the factory | `./mvnw -B -q test-compile`, `twf check` |
| 5. Tests | Floor: one happy-path test per workflow under `TestWorkflowEnvironment.newInstance()`, which skips time by default (`temporal-testing` `TestEnvironmentOptions.java:55`), since designs wait minutes to hours, its worker built from the registrations method | `./mvnw -B -q verify` |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `// TODO:` naming the elided logic (e.g. `// TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root:

```sh
./mvnw -B -q verify
```

## Output conventions

- One Java package (and directory) per `.twf` package.
- Each workflow and activity set is an interface file and an impl file, per [`java.md` § File Organization Best Practice](https://github.com/temporalio/skill-temporal-developer/blob/v0.6.3/references/java/java.md#file-organization-best-practice).
- A `Workers.java` holds one registrations method per `.twf` worker, named for the worker (`registerApprovalTypes(Worker worker)`), registering its workflows, activities and Nexus services (`worker/Worker.java:280,478,497`), shared by the worker process and the tests. Its `@sdk(java, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(java, "java/Workers.java")`.

## Reference index

Load only what the current layer needs.

| DSL | Java | File |
|-----|------|------|

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: a child stub whose `ChildWorkflowOptions` set `setParentClosePolicy(ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON)` and `setCancellationType(ChildWorkflowCancellationType.ABANDON)`, so neither the caller's close nor its cancellation reaches the child (`workflow/ChildWorkflowOptions.java:228,278`, `workflow/ChildWorkflowCancellationType.java:33`); `Async.procedure(child::run, arg)`, then `Workflow.getWorkflowExecution(child).get()`, which resolves once the child starts, so a failed start fails the caller (`workflow/Workflow.java:506`). A client start just starts. Neither reads the result.
- **`detach nexus`** (preview: `NexusOperationCancellationType` is `@Experimental`, `workflow/NexusOperationCancellationType.java:17`): a service stub whose `NexusServiceOptions.setOperationOptions` sets `setCancellationType(NexusOperationCancellationType.ABANDON)` (`workflow/NexusOperationOptions.java:96-97`); `Workflow.startNexusOperation(svc::op, arg).getExecution().get()` (`workflow/Workflow.java:1828`), which resolves once the operation starts (a sync operation starts by completing) and never calls `getResult()` (`workflow/NexusOperationHandle.java:19-22`). After the caller closes, the operation's completion callback to it fails and is dropped.
