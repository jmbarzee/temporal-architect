---
name: temporal-architect-author-haskell
description: Generate Haskell code from .twf workflow designs using the community Temporal Haskell SDK (MercuryTechnologies/hs-temporal-sdk). Use when implementing workflows defined in TWF, producing compiled and tested Haskell projects from DSL specifications.
---

# Temporal Architect: Haskell Authoring

Turn `.twf` files into Haskell that compiles, runs, and implements the design with the community Temporal Haskell SDK. The deliverable is always `.hs` files.

## Orient

The mapping relies on `MercuryTechnologies/hs-temporal-sdk` at commit `e57a0ae` on GHC 9.10, the SDK's only CI compiler (`nix/utils/matrix.nix:8-10`), as the corpus pins them. No Hackage release carries Nexus: the only one, `2025.10.1.0`, predates it (`cac6d13`, March 2026), so the pin is a commit; at any other commit, check a call shape against its source before using it. Paths in this skill are in the SDK's source at `e57a0ae`, relative to `sdk/src/Temporal/` except `README.md` and those starting with `core/`, `nix/` or `sdk/`.

The SDK is community-maintained by Mercury, not Temporal, and makes no stability guarantee (`README.md:14-15`).

Settle where the code lands. The project root is the directory whose `cabal.project` lists a package that depends on `temporal-sdk`. In greenfield it builds the SDK's packages as local packages from a pinned clone: as a `source-repository-package` or a store install they cannot link, because `temporal-sdk-core`'s custom setup registers its build directory as the Rust bridge's library directory (`core/Setup.hs:114-119`). In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. No construct derives a name from Haskell code: each takes it as a string.

| Construct | Haskell default | Set the `.twf` name by |
|---|---|---|
| workflow | none: `provideWorkflow codec name` (`Workflow/Definition.hs:141-155`) | `provideWorkflow JSON "Name"` |
| activity | none: `provideActivity codec name` (`Activity.hs:99-112`) | `provideActivity JSON "Name"` |
| signal | none: `KnownSignal { signalName, signalCodec }` (`Workflow/Signal.hs:10-15`) | `KnownSignal "Name" JSON` |
| query | none: `KnownQuery { queryName, queryCodec }` (`Workflow/Query.hs:24-29`) | `KnownQuery "Name" JSON` |
| update | none, and the codec comes first: `KnownUpdate { knownUpdateCodec, knownUpdateName }` (`Workflow/Update.hs:11-17`) | `KnownUpdate JSON "Name"` |
| Nexus service | none: the handler's `serviceName` (`Nexus/Worker.hs:38-41`); the caller's `makeNexusClient endpoint service` (`Workflow/Types.hs:445`, `Workflow.hs:555`) | `serviceName = "Name"`; `makeNexusClient "Endpoint" "Name"` |
| Nexus operation | none: the key in the handler's `operations` map (`Nexus/Worker.hs:40`); the caller's `NexusOperationName` (`Workflow.hs:556`) | `HashMap.fromList [("Name", handler)]`; `executeNexusOperation client "Name" …` |

Never register through Template Haskell's `registerWorkflow 'fn` or `registerActivity 'fn`: it registers the module-qualified function name, `"Module.fn"` (`TH/Internal.hs:52-57`, `TH/Classes.hs:103,183`), silently.

Types map by Haskell's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Haskell translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. Temporal's official `temporal-developer` skill has no Haskell coverage, so how to write Haskell Temporal code well belongs to the SDK's haddock and `MercuryTechnologies/hs-temporal-cookbook`, which [idioms.md](./reference/idioms.md) links by topic at their pins:

| Topic | Source |
|---|---|
| worker setup | [idioms.md § worker setup](./reference/idioms.md#worker-setup) |
| testing | [idioms.md § testing](./reference/idioms.md#testing) |
| determinism | [idioms.md § determinism](./reference/idioms.md#determinism) |
| errors | [idioms.md § errors](./reference/idioms.md#errors) |
| data | [idioms.md § data](./reference/idioms.md#data) |
| versioning | [idioms.md § versioning](./reference/idioms.md#versioning) |

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Haskell.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripe-haskell` package (typed, matches your existing dependency) or plain `http-client` (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, the `cabal.project` and `.cabal` files, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known packages when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Records deriving `Generic`, `FromJSON`, `ToJSON`; each workflow a `provideWorkflow JSON "Name"` with a stub body | `cabal build all` |
| 1b. Activity stubs | Every `provideActivity JSON "Name"` with its real signature, so workflows call it through `executeActivity` | `cabal build all` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `cabal build all` |
| 3. Activity impl | Activity bodies, with dependencies read from the activity environment `configure` takes (`Worker.hs:196`) | `cabal build all` |
| 4. Worker wiring | Each worker's `<worker>Types`; the process connects a client, passes its namespace and task queue settings, and calls `startWorker` (`Worker.hs:780`) | `cabal build all`, `twf check` |
| 5. Tests | Floor: one happy-path hspec test per workflow against `withTestServer` (`EphemeralServer.hs:54`) with a client set to `enableTimeSkipping = True` (`Client/Types.hs:140`), since designs wait minutes to hours, its worker built from `<worker>Types` | `cabal test all` |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `-- TODO:` naming the elided logic (e.g. `-- TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root:

```sh
cabal test all
```

## Output conventions

- One Haskell module tree per `.twf` package.
- Each `.twf` worker has one `WorkerConfig`, since a config polls one task queue (`Worker.hs:319`): a function named for the worker, `approvalTypes :: ConfigM () () -> WorkerConfig ()`, `approvalTypes = configure () (approval, count)`, registering its workflows and activities, and its Nexus services through `addNexusServiceHandler` (`Worker.hs:196-201,541`). The caller passes the settings, so the worker process and the tests share it; activities with dependencies take an environment, `approvalTypes :: env -> ConfigM env () -> WorkerConfig env`, `approvalTypes env = configure env (approval, count)`. Its `@sdk(haskell, "<path>")` names that function's module file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(haskell, "haskell/Approval.hs")`.

## Reference index

Load only what the current layer needs.

| DSL | Haskell | File |
|-----|---------|------|

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: a child start is `h <- startChildWorkflow wf defaultChildWorkflowOptions { parentClosePolicy = ParentClosePolicyAbandon, cancellationType = ChildWorkflowCancellationAbandon } x`, so neither the caller's close nor its cancellation reaches the child (`Workflow/Types.hs:191-228`), then `waitChildWorkflowStart h`, which resolves once the child starts, so a failed start fails the caller (`Workflow/Unsafe/Handle.hs:99-102`, `WorkflowInstance.hs:804-829`). A client start just starts. Neither waits for the result.
- **`detach nexus`**: unsupported at the pin. `NexusOperationAbandon` is defined in `Temporal.Workflow.Types` (`Workflow/Types.hs:415-423`), a hidden module (`sdk/temporal-sdk.cabal:48,71`) that no exposed module re-exports, so a call's `cancellationType` stays at its default `NexusOperationTryCancel` (`Workflow/Types.hs:459-465`); and `startNexusOperation` returns one `Task` that waits for the start and the result together (`Workflow.hs:565-567`), so nothing waits for the start alone.
