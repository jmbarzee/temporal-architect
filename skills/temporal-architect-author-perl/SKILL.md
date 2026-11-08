---
name: temporal-architect-author-perl
description: Generate Perl code from .twf workflow designs using the community Temporal Perl SDK (sdk-perl). Use when implementing workflows defined in TWF, producing compile-checked and tested Perl projects from DSL specifications.
---

# Temporal Architect: Perl Authoring

Turn `.twf` files into Perl that compiles, runs, and implements the design with the Temporal Perl SDK. The deliverable is always `.pm` files.

## Orient

The mapping relies on [sdk-perl](https://github.com/MasonEgger/sdk-perl) at commit `55816a1` (dists `0.2.0`, `sdk/dist.ini:8`; no tags, no CPAN release), on Perl 5.38 (the SDK requires `>= 5.038`, `sdk/cpanfile:3`) and sdk-core from `temporalio/sdk-rust` `v0.4.0` (`alien-core/alienfile:9`), as the corpus pins them; at another commit, check a call shape against that commit's source before using it.

sdk-perl is community-maintained, not an official Temporal SDK, and pre-1.0: its API may still break (`README.md:23-34`). This skill supports it at Tier 3.

Settle where the code lands. The project root is the directory whose `cpanfile` requires `Temporalio::Client` or `Temporalio::Worker`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. Paths below are in sdk-perl source at `55816a1` (`sdk/lib/Temporalio/`).

| Construct | Perl default | Set the `.twf` name by |
|---|---|---|
| workflow | a `:Run` method named `run` → the package basename; any other `:Run` method → the method name (`Workflow/Attributes.pm:111-112,142-145`) | naming the package as the `.twf` does, else `:Run('Name')` |
| activity | the `:Defn` method name as written (`Activity/Attributes.pm:23-24,62`) | `:Defn('Name')` |
| signal | the `:Signal` method name as written (`Workflow/Attributes.pm:29,86`) | `:Signal('Name')` |
| query | the `:Query` method name as written (`Workflow/Attributes.pm:29,86`) | `:Query('Name')` |
| update | the `:Update` method name as written (`Workflow/Attributes.pm:29,86`) | `:Update('Name')` |
| Nexus service | the class basename (`Nexus/Definition.pm:94-101`) | naming the class as the `.twf` does, else `:NexusService('Name')` on one method |
| Nexus operation | the method name as written (`Nexus/Definition.pm:81-83`) | `:SyncOperation('Name')` / `:WorkflowRunOperation('Name')` |

Name every `.twf` name explicitly unless the default already equals it. Perl methods are snake_case, so a handler, activity or operation almost always takes its name; a missing one registers the method name silently.

Types map by Perl's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Perl translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. Temporal's `temporal-developer` skill does not cover Perl; how to write Perl Temporal code well belongs to sdk-perl's own README at `55816a1`, plus the Perl traps in [idioms.md](./reference/idioms.md). Read these for each topic:

| Topic | sdk-perl `55816a1` |
|---|---|
| worker setup | [§ Workers](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#workers), [§ Running a Worker](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#running-a-worker), [§ Definition](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#definition) (one attributed class per file) |
| testing | [§ Testing](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#testing), [§ Replay](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#replay) |
| determinism | [§ Workflow logic constraints](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#workflow-logic-constraints), [§ Deterministic time, randomness, and logging](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#deterministic-time-randomness-and-logging) |
| errors | [§ Workflow exceptions](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#workflow-exceptions) |
| data | [§ Data conversion](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#data-conversion) |
| versioning | [§ Versioning (patching)](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#versioning-patching); worker versioning is only in the `Worker.pm` POD (`deployment_options`, `sdk/lib/Temporalio/Worker.pm:1300`) |

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Perl.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `Business::Stripe` module (matches your existing dependency) or plain `HTTP::Tiny` (core, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, the `cpanfile`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known CPAN modules when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

Perl has no type checker: each layer's check is `perl -c` on every module it touched, and the tests carry the rest.

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | `Temporalio::Workflow::Definition` classes with stub `:Run` methods; shaped by the dependency map | `perl -c` |
| 1b. Activity stubs | Every `Temporalio::Activity::Definition` class with its real `:Defn` signatures, so workflows call them through `Temporalio::Workflow::execute_activity` | `perl -c` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `perl -c` |
| 3. Activity impl | Thin `:Defn` methods + concrete implementations held in `field`s | `perl -c` |
| 4. Worker wiring | Each worker's `<Worker>Types.pm`; the process builds dependencies, calls its `worker`, and runs it | `perl -c`, `twf check` |
| 5. Tests | Floor: one happy-path `Test::More` file per workflow in `t/`, against a dev server from `Temporalio::Test::DevServer` (`Test/DevServer.pm`), its worker built from the `worker` sub. There is no time-skipping environment (`README.md:1260-1262`): waits are real, so a long design timer is tested with a short one | `prove` ([Verify](#verify)) |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `# TODO:` naming the elided logic (e.g. `# TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the worker's Perl directory, with the `temporal` CLI on `PATH` for the tests' dev server:

```sh
printf '%s\n' *.pm | xargs -n1 perl -I. -c && prove -I. t
```

## Output conventions

- One attributed class per `.pm`: a second attributed `class` in one file fails to compile (`README.md:537-553`).
- One Perl namespace per `.twf` package (`Billing::Invoice` in `Billing/Invoice.pm`); the basename stays the wire name.
- Each `.twf` worker has a `<Worker>Types.pm` module (`ApprovalTypes.pm`) whose `sub worker ($client, %opts)` returns the `Temporalio::Worker->new(client =>, task_queue =>, workflows => [...], activities => [...], nexus_services => [...])` (`Worker.pm:36-40`), shared by the worker process and the tests. Its `@sdk(perl, "<path>")` names that module, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(perl, "perl/ApprovalTypes.pm")`.

## Reference index

Load only what the current layer needs.

| DSL | Perl | File |
|-----|------|------|

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: a child start is `await Temporalio::Workflow::start_child_workflow('W', args => [...], id => …, parent_close_policy => 'abandon', cancellation_type => 'abandon')`, so neither the caller's close nor its cancellation reaches the child (`Workflow/Runner.pm:4371`, `:4307`); it resolves once the child starts, so a failed start fails the caller (`Workflow.pm:272-278`, `Workflow/Runner.pm:2589-2647`). A client start just starts. Neither awaits the handle's `result`.
- **`detach nexus`**: `await $nc->start_operation('Op', $arg, cancellation_type => 'abandon')` (`Workflow/NexusClient.pm:44`, `Workflow/Runner.pm:4328`), which resolves once the operation starts (a sync operation starts by completing) and fails on a failed start (`Workflow/Runner.pm:2754-2815`), and never awaits the handle's `result`. After the caller closes, the operation's completion callback to it fails and is dropped.
