---
name: temporal-workflow-design
description: Design Temporal workflows with proper determinism, idempotency, and decomposition. Use when designing new workflows, planning workflow-activity boundaries, or reviewing workflow architecture.
---

# Temporal Workflow Design

Design Temporal workflows using `.twf` (Temporal Workflow Format) — a language-agnostic DSL capturing workflow structure, activity boundaries, and Temporal primitives. Always produce `.twf` files as deliverables, never SDK code.

---

## Design Flow

Core loop: **write TWF → `twf check` → fix/consult → repeat**. Parser errors are design feedback — validate early and often.

**Write before you read.** Draft TWF from the workflow description even if you're unsure — use `twf check --lenient` for incomplete designs. Consult references only to fix specific errors, not to prepare.

```
  ┌────────────┐
  │ Write/Edit │◄──────────────┐
  │ .twf file  │               │
  └─────┬──────┘               │
        ▼                      │
  ┌────────────┐               │
  │ twf check  │               │
  └─────┬──────┘               │
        ▼                      │
   ┌─────────┐                 │
   │ Error?  │──No──► Done     │
   └────┬────┘                 │
        │Yes                   │
        ▼                      │
  ┌─────────────┐              │
  │ Can fix     │──Yes─────────┘
  │ confidently?│
  └──────┬──────┘
         │No
         ▼
  ┌─────────────┐
  │ Consult     │──────────────┘
  │ user        │
  └─────────────┘
```

### Worked Example

**Draft** — write from the description, don't worry about completeness:

```twf
workflow ProcessOrder(order: Order) -> (OrderResult):
    activity ValidateOrder(order) -> validated
    activity ChargePayment(order.payment) -> payment
    activity ShipOrder(order, payment) -> shipment
    close complete(OrderResult{shipment})
```

**Iteration 1** — `twf check` finds errors:

```
resolve error at 2:5: undefined activity "ValidateOrder"
resolve error at 3:5: undefined activity "ChargePayment"
resolve error at 4:5: undefined activity "ShipOrder"
```

Fix — add the missing definitions. `twf check` → `✓ OK`

**Iteration 2** — design review. Shipping involves creating a shipment, waiting for carrier pickup, and tracking — multiple steps with independent retry. Consult [workflow-boundaries.md](./reference/workflow-boundaries.md): multi-step orchestration with its own lifecycle → child workflow.

Revise — extract `ShipOrder` as a child workflow:

```twf
workflow ProcessOrder(order: Order) -> (OrderResult):
    activity ValidateOrder(order) -> validated
    activity ChargePayment(order.payment) -> payment
    workflow ShipOrder(order, payment) -> shipment
    close complete(OrderResult{shipment})
```

`twf check` → `✓ OK`. Design is structurally sound.

### Revising an Existing Design

To revise an existing `.twf` file: run `twf symbols` to understand current structure, make edits, then re-enter the core loop (`twf check` → fix → repeat). Treat user feedback as new requirements — ask clarifying questions before editing if the feedback is ambiguous.

### When to Consult the User

**Fix yourself:** clear syntax mistakes, unambiguous errors (undefined → add definition), pattern exists in docs.

**Ask the user:** multiple valid approaches, requirements gap, unclear architectural choice, workaround feels wrong.

**Cost of asking < Cost of wrong design.**

---

## `twf` CLI

**Run `twf check` after every `.twf` edit.** Fix all errors before presenting to user.

| Command | Purpose |
|---------|---------|
| `twf check <file...>` | Parse + resolve — run after every edit |
| `twf symbols <file...>` | List all workflow/activity signatures |
| `twf symbols --json <file...>` | Machine-readable symbol output |
| `twf check --lenient <file...>` | Partial tolerance for incomplete designs |

**Error format** (stderr): `parse error at <line>:<col>: <message>` / `resolve error at <line>:<col>: <message>`

---

## TWF Syntax

Full grammar: [`tools/spec/sections/`](../../../tools/spec/sections/) (or run `twf spec` for the concatenated view; `twf spec --list` for slugs). Quick reference: [`notation-reference.md`](./reference/notation-reference.md). Examples: [`notation-examples.md`](./reference/notation-examples.md). Common errors: [`common-errors.md`](./reference/common-errors.md).

All `.twf` must pass `twf check` before presenting to user. Activity bodies are free-form pseudocode — detail level depends on how obvious the behavior is (see [notation-examples.md](./reference/notation-examples.md#activity-body-detail)).

---

## Completion

The design is ready to present when:

1. `twf check` passes with no errors
2. `twf symbols` lists all expected workflows and activities
3. Worker/namespace topology validates (when present)
4. All I/O, time, and randomness live in activities (determinism)
5. Activities are idempotent (retries produce same result)
6. Failure modes have recovery strategies

For the full checklist: [design-checklist.md](./reference/design-checklist.md). For complex control flow, parallel execution, or signal/timer races, suggest the TWF visualizer extension. Present a summary alongside the `.twf` file: key workflows, activity purposes, and notable design decisions.

---

## Handoff

The deliverable is the `.twf` file. Do not implement SDK code within this skill. If an authoring skill is available (e.g. `author-go`, `author-ts`), suggest it. Alongside the `.twf` file, note: target SDK/language, external system assumptions, and design decisions not captured in the notation.

---

## Reference Index

Read only what the current design requires.

| Topic | When to Consult | File |
|-------|-----------------|------|
| Determinism & Idempotency | Replay safety and retry resilience review | [core-principles.md](./reference/core-principles.md) |
| Workflow Boundaries | Activity vs child workflow decision | [workflow-boundaries.md](./reference/workflow-boundaries.md) |
| Signal vs Update | Choosing between signal and update for external input | [signals-queries-updates.md](./topics/signals-queries-updates.md) |
| Notation Examples | Control flow, handlers, timers, nexus in TWF | [notation-examples.md](./reference/notation-examples.md) |
| Notation Reference | All TWF syntax constructs | [notation-reference.md](./reference/notation-reference.md) |
| Design Checklist | Final verification before presenting | [design-checklist.md](./reference/design-checklist.md) |
| Anti-Patterns | Common Temporal design mistakes | [anti-patterns.md](./reference/anti-patterns.md) |
| Common Errors | Troubleshooting `twf check` parser/resolver errors | [common-errors.md](./reference/common-errors.md) |
| Primitives Reference | Temporal primitive lookup | [primitives-reference.md](./reference/primitives-reference.md) |
| Workers & Task Queues | Worker grouping, task queue routing, deployment | [task-queues.md](./topics/task-queues.md) |
| Nexus | Cross-namespace communication | [nexus.md](./topics/nexus.md) |
Topic deep-dives are in `reference/` and `topics/` — consult as needed during design.
