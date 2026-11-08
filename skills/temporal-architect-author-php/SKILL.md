---
name: temporal-architect-author-php
description: Generate PHP code from .twf workflow designs using the Temporal PHP SDK. Use when implementing workflows defined in TWF, producing statically checked and tested PHP projects from DSL specifications.
---

# Temporal Architect: PHP Authoring

Turn `.twf` files into PHP that loads, runs, and implements the design with the Temporal PHP SDK. The deliverable is always `.php` files.

## Orient

The mapping relies on PHP SDK `temporal/sdk` `2.20` on PHP 8.4 (the SDK requires `>=8.2`, its root `composer.json:24`) with `ext-grpc`, which the client cannot run without (`Client/GRPC/BaseClient.php:74-76`), and RoadRunner (`rr`) `2025.1.15`, as the corpus pins them; on an older minor, check a call shape against that version's source before using it. Paths in this skill are in the SDK's source at `v2.20`, under `src/` unless they start with `testing/`.

Settle where the code lands. The project root is the directory whose `composer.json` requires `temporal/sdk`, beside the RoadRunner config (`.rr.yaml`) that starts the worker. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code.

| Construct | PHP default | Set the `.twf` name by |
|---|---|---|
| workflow | the short name of the class or interface carrying `#[WorkflowInterface]`, with no `I` trimmed (`Internal/Declaration/Reader/WorkflowReader.php:433`) | naming the class as the `.twf` does, else `#[WorkflowMethod(name: '…')]` |
| activity | the `#[ActivityInterface]` `prefix` + the method name as is; the prefix applies even to an explicit name (`Internal/Declaration/Reader/ActivityReader.php:162-169`) | `#[ActivityInterface(prefix: '')]` and `#[ActivityMethod(name: '…')]` |
| signal | the method name as is (`Internal/Declaration/Reader/WorkflowReader.php:223`) | `#[SignalMethod(name: '…')]` |
| query | the method name as is (`Internal/Declaration/Reader/WorkflowReader.php:248`) | `#[QueryMethod(name: '…')]` |
| update | the method name as is (`Internal/Declaration/Reader/WorkflowReader.php:193`) | `#[UpdateMethod(name: '…')]` |
| Nexus service | unsupported: no Nexus API | — |
| Nexus operation | unsupported: no Nexus API | — |

Every camelCase method needs its `name:`; a missing one registers the method name silently. The attribute docblocks contradict the source: they say an activity's default is capitalized, its prefix ignored beside an explicit name (`Activity/ActivityInterface.php:26-27,42-43`), and a workflow's default is `{class_name :: method_name}` (`Workflow/WorkflowMethod.php:27`).

PHP has no Nexus: `temporal/sdk` 2.20 has no Nexus Operations API, only worker tuning fields (`Worker/WorkerOptions.php:131-140`), so every spec 04 construct is unsupported in PHP: it lives on a worker in another SDK.

Types map by PHP's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ PHP translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. How to write PHP Temporal code well belongs to Temporal's official `temporal-developer` skill; its `v0.6.3` tag carries no PHP, so these links pin `main` at `2d334cd`, and re-pin to the first `temporal-developer` tag that carries PHP. Load it for these topics:

| Topic | `temporal-developer` |
|---|---|
| worker setup | [`references/php/php.md` § Worker Setup](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/php.md#worker-setup), [§ File Organization Best Practice](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/php.md#file-organization-best-practice), [`gotchas.md` § Worker Startup](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#worker-startup) |
| testing | [`references/php/testing.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/testing.md) |
| determinism | [`references/php/determinism.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/determinism.md), [`determinism-protection.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/determinism-protection.md), [`gotchas.md` § Generators and Promises](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#generators-and-promises) |
| errors | [`references/php/error-handling.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/error-handling.md) |
| data | [`references/php/data-handling.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/data-handling.md) |
| versioning | [`references/php/versioning.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/versioning.md) |

If it is not installed, read the topic's file at its link.

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working PHP.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripe/stripe-php` package (official, matches your existing dependency) or plain Guzzle (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, the `composer.json`, the `.rr.yaml`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known packages when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Classes with typed public properties; `#[WorkflowInterface]` classes with stub generator `#[WorkflowMethod]`s; interfaces shaped by the dependency map | `vendor/bin/phpstan analyse` |
| 1b. Activity stubs | Every `#[ActivityInterface]` with its real method signatures, so workflows call it through `Workflow::newActivityStub` | `vendor/bin/phpstan analyse` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `vendor/bin/phpstan analyse` |
| 3. Activity impl | Activity classes, with dependencies through the factory `registerActivity` takes (`Worker/WorkerInterface.php:74`) | `vendor/bin/phpstan analyse` |
| 4. Worker wiring | Each worker's `Workers::registerXxxTypes`; `worker.php` builds dependencies, calls them, and runs the factory | `vendor/bin/phpstan analyse`, `twf check` |
| 5. Tests | Floor: one happy-path PHPUnit test per workflow on `Temporal\Testing\TimeSkippingWorkflowTestCase` (`testing/src/TimeSkippingWorkflowTestCase.php:12`), since designs wait minutes to hours, against the time-skipping test server and one `rr serve` of `worker.php` (`testing/src/Environment.php:146-206`) | `vendor/bin/phpunit` |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `// TODO:` naming the elided logic (e.g. `// TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root, where `dload.xml` fetches `rr` and the test server:

```sh
composer install --no-interaction --no-progress && vendor/bin/dload get -n -q && vendor/bin/phpstan analyse --no-progress && vendor/bin/phpunit
```

## Output conventions

- One PHP namespace (a PSR-4 directory) per `.twf` package.
- A `Workers` class holds one static `registerXxxTypes(WorkerFactoryInterface $factory)` per `.twf` worker, named for the worker (`registerApprovalTypes`), which calls `$factory->newWorker('<task queue>')` and registers its workflows and activities (`Worker/WorkerFactoryInterface.php:41`, `Worker/WorkerInterface.php:36-74`). Its `@sdk(php, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(php, "php/Workers.php")`.
- A `worker.php` calls each `registerXxxTypes`, then `$factory->run()` (`WorkerFactory.php:257`). RoadRunner runs it (`rr serve`); never run it directly.

## Reference index

Load only what the current layer needs.

| DSL | PHP | File |
|-----|-----|------|

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: a child start is `yield Workflow::newUntypedChildWorkflowStub('Name', ChildWorkflowOptions::new()->withParentClosePolicy(ParentClosePolicy::Abandon))->start(…)`, which resolves once the child starts, and a failure response to that start rejects it, so the `yield` throws in the caller (`Internal/Workflow/ChildWorkflowStub.php:66-103`, `Internal/Transport/Client.php:70-76`), plus `FeatureFlags::$cancelAbandonedChildWorkflows = false;` in the worker entry file: at its default `true` the SDK cancels an Abandon child with its parent (`Worker/FeatureFlags.php:51`, `Internal/Workflow/ChildWorkflowStub.php:87-88`). The flag is process-wide. `ChildWorkflowCancellationType::Abandon` cannot be used: its marshaller writes a bool and throws on any value but `WaitCancellationCompleted` and `TryCancel` (`Internal/Marshaller/Type/ChildWorkflowCancellationType.php:24-31`). A client start just starts. Neither calls `getResult()`.
- **`detach nexus`**: unsupported: PHP has no Nexus API.
