# Reverse Engineering: Code → `.twf`

Most teams already run Temporal code. Here the **implementation is the requirement** and the `.twf` is recovered from it — as the living design the team will keep editing and reviewing, so capture it faithfully enough to be worth keeping. Discovery is context-heavy and disposable, so it runs in subagents that return only conclusions to the main context.

Recover **deliberately, one bounded slice at a time** — a domain, a service, a set of entry points. A whole-repo sweep produces a `.twf` nobody can check; a target larger than one slice is [decomposed first](#decompose-a-large-repo-into-slices).

## Read the notation first

The greenfield advice "write before you read the reference docs" inverts here: the semantics are already in the code, and the notation is the only unknown. Read `notation-examples.md` and the `state:` conventions — or `twf spec --list` / `twf spec <slug>` — before drafting. Drafting blind costs parser round-trips and a first draft the design review flags wholesale.

## Two cases

### B1a — Bootstrap (no `.twf` yet)

1. **Discover** — dispatch the [project-discovery subagent](../subagents/project-discovery.md) on the slice.
2. **Extract** — translate what it found into `.twf` ([Reading strategy](#reading-strategy)).
3. **Fidelity check** — confirm the `.twf` matches what the code does ([Fidelity first](#fidelity-first-then-design-review)).
4. **Design Review** — only now run the standard [Design Review](../SKILL.md#design-review).

Mirror the code's layout: each domain in its own [package](./twf-conventions.md#package-per-domain-directory), `import` across packages for cross-domain references, and an [impl-link header](./twf-conventions.md#impl-link-header) recording where the implementation lives. `worker` and `namespace` follow [Deployment topology during recovery](#deployment-topology-during-recovery).

### B1b — Drift (`.twf` exists but is stale)

- **Check (available now):** on a bounded slice, compare the `.twf` against current code and report divergences — missing activities, changed boundaries, dropped signals.
- **Sync (deferred):** mechanical reconciliation waits on the twf↔impl mapping ([#24](https://github.com/jmbarzee/temporal-architect/issues/24)). Until then, re-extract the drifted slice (B1a steps 2–4), treating the code as the source of truth for *behavior* and the existing `.twf` for *intent*.

## Deployment topology during recovery

A real monorepo runs a few **shared worker processes**, each hosting many domains' types on one task queue. A slice has no view of the whole shared worker, so declaring a `worker`/`namespace` per slice either collides on the shared name or invents a placeholder — and the `UNINSTANTIATED_WORKER` / `UNCOVERED_*` warning wall follows.

- **Domain slices emit symbols only** — no `worker` or `namespace`, and **never** a placeholder worker to quiet coverage warnings. "Symbols only" limits *deployment declarations*, not depth: a slice still recovers every workflow body — every call, child workflow, and signal. Stub bodies render as one-level trees and leave the routing diagnostics nothing to test.
- **Author the shared topology once, at stitch** — a single topology-owner `deploy` package `import`s each domain and registers its types by **package-qualified ref**, one shared `worker` per real worker process (the forward `deploy/topology.twf` convention in [twf-conventions.md](./twf-conventions.md#package-per-domain-directory) and the [packages topic](../topics/packages.md)). project-discovery reads the shared worker → task queue → registered types mapping that fills it.
- **Coverage stays real.** Coverage and routing diagnostics run only for an analysis with a `namespace`, so a symbols-only slice is quiet on its own; at stitch the qualified registrations become genuine coverage, and `UNCOVERED_*` / `UNINSTANTIATED_WORKER` fire only on real gaps. See `twf spec workers-and-namespaces` (Shared Workers: Joint Ownership; Validator interplay).

## Decompose a large repo into slices

When the target is **more than one bounded slice** — a whole service, a multi-domain monorepo, boundaries you cannot yet name — carving and ordering the slices is the hard step. This is the reverse analog of `twf graph chunks` → per-chunk author, as an advisory protocol rather than an engine:

1. **Map** — dispatch the [slice-mapper subagent](../subagents/slice-mapper.md) on the repo root. It returns a proposed slice map, a cross-slice edge list (`from` → `to`, `via` = the contract artifact), and a suggested order. It recovers nothing.
2. **Confirm** — narrow the map **with the user** before any fan-out.
3. **Order** — **contract producers before consumers**: pin the shared contracts (the proto package / Nexus op / shared worker others depend on) first. A producer recovered first is a real package the consumer can `import`, so no cross-slice edge needs a placeholder.
4. **Fan out** — one project-discovery + extraction (B1a steps 2–4) per confirmed slice, in that order, each into its own package under the symbols-only rule.

Keep this distinct from the forward codegen fan-out ([#85](https://github.com/jmbarzee/temporal-architect/issues/85)); a deterministic code → map engine is deferred to [#128](https://github.com/jmbarzee/temporal-architect/issues/128).

## Stitch & `twf check`

1. **Collect** the per-slice packages into one workspace `twf check` resolves together.
2. **Resolve cross-slice references** — the consumer `import`s the producer's package and refers to its symbols by qualified name.
3. **Author the shared topology** in the `deploy` package ([above](#deployment-topology-during-recovery)).
4. **Check the whole workspace**, not slice by slice, and iterate to clean — a package that checked alone can still surface cross-package resolution or coverage gaps.

An `IMPLICIT_ROUTING_MISMATCH` means a call cannot reach any worker hosting its target. Go back to the code — usually a task-queue override, a default, or a configurator you had not traced — and fix the model to match the code, not the reverse. `twf graph` shows how the system is **wired**, never how much it **runs**: no timers, continue-as-new frequency, fan-out width, or volume. When a recovery serves a cost question, say so.

## Reading strategy

Read for **design structure**, not line-by-line behavior:

- **Entry points first** — client-started, schedule-started, Nexus-operation-backing, and handler-bearing workflows are the roots of the `.twf`.
- **Follow call sites** — `workflow.ExecuteActivity`, `workflow.ExecuteChildWorkflow`, Nexus operation calls become `activity` / `workflow` / `nexus` calls.
- **Keep every workflow-to-workflow edge.** Child workflows, Nexus operations, and signals are the only edges deeper than one level; activities are leaves. Never flatten a child workflow into an activity stub. Where the notation cannot express an edge — a signal by ID to a workflow the caller did not start; a workflow started, signalled, or updated from an activity or client code; an update or cancel sent to another workflow — record it in prose with its `file:line`, so the graph is not read as the complete coupling.
- **Ignore the plumbing** — error wrapping, `context` threading, logging, options structs, retry/timeout boilerplate. Keep only options that express a real decision (a tuned timeout, a capped retry).
- **Detect parallelism** — `workflow.Go`, `workflow.NewSelector`, futures held and `.Get` later → `await all` / `await one` / `promise`. A `.Get` right after the call is a synchronous call.

**Delegate SDK reading to the author skill** — read its forward (DSL → Go) symbol tables backward. For Go: `temporal-architect-author-go` references (`activity-call.md`, `workflow-call.md`, `await-all.md`, …) and, for generated code, `reference/proto-driven.md` (generated `XxxActivities` iface, `RegisterXxxActivities`, `XxxFuture` → the underlying `activity`/`workflow`).

## Fidelity first, then Design Review

**Capture what the code does, including its anti-patterns** — a wrapper workflow, a monolith, an unbounded loop, as they are. "Fixing" during extraction yields a `.twf` of a system that doesn't exist and hides the problems the team needs to see.

- **Do not** refactor, rename, or improve during extraction.
- **Account for every registered activity.** One nothing in the model calls is either unused in the code or a call you missed; find out which before trusting a clean check.
- **Intent-fill only genuinely unimplemented stubs** — a `// TODO` body, a panic-not-implemented, an empty handler — and mark them.

Then run the standard [Design Review](../SKILL.md#design-review): anti-patterns are named and proposed for change there, as an explicit diff against an honest record of what exists.
