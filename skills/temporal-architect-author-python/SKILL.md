---
name: temporal-architect-author-python
description: Generate Python code from .twf workflow designs using the Temporal Python SDK. Use when implementing workflows defined in TWF, producing type-checked Python projects from DSL specifications.
---

# Temporal Architect: Python Authoring

Turn `.twf` files into Python that type-checks, runs, and implements the design with the Temporal Python SDK. The deliverable is always `.py` files.

## Orient

The mapping relies on Python SDK `temporalio` `1.35` (which pins `nexus-rpc` 1.4.0 itself) on Python 3.13 with uv, as the corpus pins them; on an older minor, check a call shape against that version's source before using it.

Settle where the code lands. The project root is the directory whose `pyproject.toml` depends on `temporalio`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. Paths below are in `temporalio` and `nexusrpc` source.

| Construct | Python default | Set the `.twf` name by |
|---|---|---|
| workflow | the `@workflow.defn` class's `__name__` (`temporalio/workflow/_definition.py:92`) | naming the class as the `.twf` does, with `name` unset |
| activity | the `@activity.defn` function's `__name__` (`temporalio/activity.py:84`) | `@activity.defn(name=…)` |
| signal | the `@workflow.signal` method's `__name__` (`temporalio/workflow/_handlers.py:139`) | `@workflow.signal(name=…)` |
| query | the `@workflow.query` method's `__name__` (`temporalio/workflow/_handlers.py:221`) | `@workflow.query(name=…)` |
| update | the `@workflow.update` method's `__name__` (`temporalio/workflow/_handlers.py:373`) | `@workflow.update(name=…)` |
| Nexus service | the `@nexusrpc.service` class's `__name__` (`nexusrpc/_service.py:130`); the handler takes it from `service_handler(service=…)` (`nexusrpc/handler/_decorators.py:103`) | naming the class as the `.twf` does, with `name` unset |
| Nexus operation | the `Operation` attribute's name (`nexusrpc/_service.py:288`) | `nexusrpc.Operation(name=…)`; the handler method keeps the attribute's name (`nexusrpc/_service.py:315`) |

Set the decorator's `name=` whenever the Python name differs from the `.twf` name: always for activities, handlers and operations, which Python names in snake_case; never for workflow and service classes, which are PascalCase in both. A missing `name=` registers the Python name silently.

Types map by Python's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Python translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. How to write Python Temporal code well belongs to Temporal's official `temporal-developer` skill, pinned at `v0.6.3`; load it for these topics:

| Topic | `temporal-developer` |
|---|---|
| worker setup | `references/python/python.md` § Worker Setup, § File Organization Best Practice, `sync-vs-async.md` |
| testing | `references/python/testing.md` |
| determinism | `references/python/determinism.md`, `determinism-protection.md` |
| errors | `references/python/error-handling.md` |
| data | `references/python/data-handling.md` |
| versioning | `references/python/versioning.md` |

If it is not installed, install it from https://github.com/temporalio/skill-temporal-developer at `v0.6.3`, or read the topic's file there.

The corpus gives each test its own time-skipping environment, since one cannot be shared among tests.

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Python.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripe` package (official, matches your existing dependency) or plain `httpx` (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, `pyproject.toml`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known packages when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Dataclasses and typed signatures with stub bodies; shaped by the dependency map | `uv run --locked mypy .` |
| 1b. Activity stubs | Every activity under `@activity.defn(name=…)` with its real signature, so workflows call it through `workflow.execute_activity` | `uv run --locked mypy .` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `uv run --locked mypy .` |
| 3. Activity impl | Thin decorated functions + concrete implementations behind protocols | `uv run --locked mypy .` |
| 4. Worker wiring | Each worker's factory function; the process builds dependencies, calls it, and runs the `Worker` | `uv run --locked mypy .`, `twf check` |
| 5. Tests | Floor: one happy-path test per workflow under `WorkflowEnvironment.start_time_skipping()`, since designs wait minutes to hours, its worker built from the factory function | `uv run --locked pytest -q` |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `# TODO:` naming the elided logic (e.g. `# TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the worker's Python directory:

```sh
uv run --locked mypy . && uv run --locked pytest -q
```

## Output conventions

- Each output directory holds top-level modules, not a package.
- Each `.twf` worker's module defines a worker-factory function named for the worker (`approval_types(client) -> Worker`), returning the `Worker` with its task queue and registrations, shared by the worker process and the tests. Its `@sdk(python, "<path>")` names that module, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(python, "python/worker.py")`.

## Reference index

Load only what the current layer needs.

| DSL | Python | File |
|-----|--------|------|
| `signal Name(params):` | `@workflow.signal(name=…)`: body, then `arrivals.add` | [signal-handler.md](./reference/signal-handler.md) |
| `query Name(params) -> (T):` | `@workflow.query(name=…)` on a plain `def` | [query-handler.md](./reference/query-handler.md) |
| `update Name(params) -> (T):` | `@workflow.update(name=…)`: body, then `arrivals.add`, then `return` | [update-handler.md](./reference/update-handler.md) |
| `await signal\|update Name -> (...)` | `await arrivals.take()` | [await-signal.md](./reference/await-signal.md) |
| `promise p <- ...` | the call's task; for a signal or update, `arrivals.take()` | [promise.md](./reference/promise.md) |
| `state:` / `condition` / `set` / `unset` | `bool` attribute + `workflow.wait_condition` | [condition.md](./reference/condition.md) |
| `await all:` | `asyncio.gather` | [await-all.md](./reference/await-all.md) |
| `await one:` | one `wait_condition` over every case; first listed ready wins | [await-one.md](./reference/await-one.md) |
| handler + condition + `await one` | worked compositions | [composite-patterns.md](./reference/composite-patterns.md) |

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: a child start is `await workflow.start_child_workflow(W.run, arg, id=…, parent_close_policy=ParentClosePolicy.ABANDON, cancellation_type=ChildWorkflowCancellationType.ABANDON)`, so neither the caller's close nor its cancellation reaches the child (`temporalio/workflow/_workflow_ops.py:129-160`); it returns once the child starts, so a failed start raises in the caller (`temporalio/worker/_workflow_instance.py:2218`). A client start just starts. Neither awaits the handle.
- **`detach nexus`**: `await client.start_operation(Svc.op, arg, cancellation_type=NexusOperationCancellationType.ABANDON)` (`temporalio/workflow/_nexus.py:47-58`), which returns once the operation starts (a sync operation starts by completing; `temporalio/worker/_workflow_instance.py:2296`) and never awaits the handle. After the caller closes, the operation's completion callback to it fails and is dropped.
