---
name: temporal-architect-design
description: Design Temporal systems — workflows, activities, workers, namespaces, and Nexus — with proper determinism, idempotency, and decomposition in `.twf`. Use when designing or reviewing Temporal architecture, planning workflow/activity boundaries, or decomposing a system into Temporal primitives.
---

# Temporal Architect: System Design

Design entire Temporal systems in `.twf` — topology, workflow structure, activity boundaries, and primitives as a parseable source of truth. The deliverable is always `.twf`, never SDK code.

## Design Flow

**orient → write `.twf` → `twf check` → fix (or ask the user) → [Design Review](#design-review) → repeat until the review finds nothing.** Parser errors are design feedback.

**Write before you read the references.** Draft from the description even when unsure (`twf check --lenient` reports every error but exits 0 while iterating), and open a reference only to fix a specific error or run the review. Two exceptions: prior project artifacts are requirements — read them first ([Orient](#orient)); and on the reverse path, [read the notation first](./reference/reverse-engineering.md#read-the-notation-first).

**Fix yourself** clear syntax mistakes, unambiguous errors (undefined → add the definition), and anything a doc pattern covers. **Ask the user** when there are multiple valid approaches, a requirements gap, an unclear architectural choice, or a workaround that feels wrong — asking costs less than a wrong design.

### Orient

Before drafting, glance (don't research) for prior work: existing `.twf`, design docs (`DESIGN.md`, `docs/`, `archive*/`). If found, read them **as requirements** and revise rather than redraft — redrafting re-derives, and silently diverges from, boundaries someone already debated. Run `twf symbols` for the current structure, edit, and re-enter the loop; treat user feedback as new requirements and ask before editing when it's ambiguous. When migrating an existing orchestration (cron, Claude Code, …), those artifacts *are* the requirements.

**When the source of truth is existing code** (a running Temporal app, no design doc), the `.twf` is *recovered*, not drafted — a separate path; don't improvise it inline. Follow [reverse-engineering.md](./reference/reverse-engineering.md): one bounded slice per [project-discovery](./subagents/project-discovery.md) dispatch, with the [slice-mapper](./subagents/slice-mapper.md) first when the target spans several. Recovery rejoins the loop at [Design Review](#design-review).

### Worked Example

Draft from the description:

```twf
workflow ProcessOrder(order: Order) -> (OrderResult):
    activity ValidateOrder(order) -> validated
    activity ChargePayment(order.payment) -> payment
    activity ShipOrder(order, payment) -> shipment
    close complete(OrderResult{shipment})
```

`twf check` reports `undefined activity` for all three; add the definitions → `✓ OK`.

Review: shipping is create shipment, await pickup, track — multiple steps with independent retry, so it becomes a child workflow ([workflow-boundaries.md](./reference/workflow-boundaries.md)). `twf check` says nothing about timeouts, retries, or history growth; those are decisions you add:

```twf
workflow ProcessOrder(order: Order) -> (OrderResult):
    activity ValidateOrder(order) -> validated
    activity ChargePayment(order.payment) -> payment
        options:
            start_to_close_timeout: 30s
            retry_policy:
                maximum_attempts: 3       # payment provider can be flaky
    workflow ShipOrder(order, payment) -> shipment
    close complete(OrderResult{shipment})
```

### Design Review

A clean `twf check` does not make a design correct: idempotency, concurrent-write races, and cross-file payload flow are invisible to the tooling. Before presenting, make one **fresh-eyes pass** — re-read the finished design as someone else's PR, setting the intent aside, or dispatch a reviewer that sees only the `.twf`.

Grade it against [design-checklist.md](./reference/design-checklist.md). The design is ready only when every checklist item holds. Present a summary with the `.twf`: key workflows, activity purposes, notable decisions. For complex control flow, parallelism, or signal/timer races, suggest the TWF visualizer extension.

## `twf` CLI

Run `twf check <file...>` after every edit. `twf symbols [--json] <file...>` lists signatures. `twf spec` prints the full grammar (`--list` for slugs, `twf spec <slug>` for one section). Flags: `twf <command> --help`.

## Handoff

Produce or review `.twf`; `temporal-architect` routes implementation, so don't select author skills or orchestrate subagents here. With the `.twf`, note what the authors need: target SDK/language, external-system assumptions, and decisions the notation doesn't capture.

## Reference Index

| Topic | When to consult | File |
|-------|-----------------|------|
| Notation Reference | TWF syntax constructs and `options:` keys | [notation-reference.md](./reference/notation-reference.md) |
| Notation Examples | Control flow, handlers, timers, nexus; how much detail an activity body needs | [notation-examples.md](./reference/notation-examples.md) |
| Common Errors | Fixing a `twf check` diagnostic | [common-errors.md](./reference/common-errors.md) |
| Determinism & Idempotency | Replay safety, retry resilience, what is (not) an activity | [core-principles.md](./reference/core-principles.md) |
| Workflow Boundaries | Activity vs child workflow vs Nexus | [workflow-boundaries.md](./reference/workflow-boundaries.md) |
| Primitives Reference | Which Temporal primitive, and its topic | [primitives-reference.md](./reference/primitives-reference.md) |
| Signal vs Update | External input into a workflow | [signals-queries-updates.md](./topics/signals-queries-updates.md) |
| Anti-Patterns | Common design mistakes | [anti-patterns.md](./reference/anti-patterns.md) |
| `.twf` Conventions | Package-per-directory layout, impl-link header | [twf-conventions.md](./reference/twf-conventions.md) |
| Packages & Imports | Cross-package references | [packages.md](./topics/packages.md) |
| Workers & Task Queues | Worker grouping, routing, deployment | [task-queues.md](./topics/task-queues.md) |
| Namespaces | Namespace count and boundaries | [namespaces.md](./reference/namespaces.md) |
| Nexus | Cross-namespace communication | [nexus.md](./topics/nexus.md) |
| Versioning | Changing a workflow that has executions in flight | [versioning.md](./topics/versioning.md) |
| Testing | Which tests a `.twf` construct calls for | [testing.md](./topics/testing.md) |
| Reverse Engineering | Recovering `.twf` from existing code, incl. the discovery and slice-mapper subagents | [reverse-engineering.md](./reference/reverse-engineering.md) |
