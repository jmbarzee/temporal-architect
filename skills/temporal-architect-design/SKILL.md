---
name: temporal-architect-design
description: Design Temporal systems — workflows, activities, workers, namespaces, and Nexus — with proper determinism, idempotency, and decomposition in `.twf`. Use when designing or reviewing Temporal architecture, planning workflow/activity boundaries, or decomposing a system into Temporal primitives.
---

# Temporal Architect: System Design

Design Temporal workflows using `.twf` (Temporal Workflow Format) — a language-agnostic DSL capturing workflow structure, activity boundaries, and Temporal primitives. Always produce `.twf` files as deliverables, never SDK code.

---

## Design Flow

Core loop: **orient → write TWF → `twf check` → fix/consult → design review → repeat**. Parser errors are design feedback — validate early and often. But a clean `twf check` is a *grammar gate*, not a finished design: it never routes straight to done (see [Design Review](#design-review)).

**Write before you read the reference docs.** Draft TWF from the workflow description even if you're unsure — use `twf check --lenient` for incomplete designs. Consult `notation-reference.md` and the other references only to fix specific errors, not to prepare. **This does not apply to prior project artifacts** (existing `.twf`, `DESIGN.md`): those are requirements — read them first (see [Orient](#orient)).

### Orient

Before drafting, glance for prior work — a quick discovery step, not a research phase:

- existing `.twf` files in the project,
- prior design docs (`DESIGN.md`, `docs/`-style notes, `archive*/` directories).

If found, read them **as requirements** and enter [Revising an Existing Design](#revising-an-existing-design) rather than drafting from scratch — drafting on top of validated prior work re-derives (and silently diverges from) boundaries someone already debated. When the task is migrating an existing orchestration (Claude-Code → Temporal, cron → Temporal, etc.), the prior artifacts *are* the requirements; discovering and reading them is the first step, not a detour.

```
  ┌────────────┐
  │ Write/Edit │◄────────────────────────┐
  │ .twf file  │                         │
  └─────┬──────┘                         │
        ▼                                │
  ┌────────────┐                         │
  │ twf check  │                         │
  └─────┬──────┘                         │
        ▼                                │
   ┌─────────┐   Yes   ┌─────────────┐   │
   │ Error?  │────────►│ Can fix     │   │
   └────┬────┘         │ confidently?│   │
        │No            └──┬───────┬──┘   │
        │             Yes │       │No    │
        │                 │       ▼      │
        │                 │  ┌─────────┐ │
        │                 │  │ Consult │ │
        │                 │  │ user    │ │
        │                 │  └────┬────┘ │
        │                 └───────┴──────┤
        ▼                                │
  ┌───────────────┐                      │
  │ Design Review │ (fresh-eyes rubric)  │
  └───────┬───────┘                      │
          ▼                              │
     ┌─────────┐   Yes (revise)          │
     │ Issues? │─────────────────────────┘
     └────┬────┘
          │No
          ▼
        Done
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

Revise — extract `ShipOrder` as a child workflow, and make the behavior over time and at scale explicit. `twf check` validates structure but says nothing about timeouts, retries, or history growth — those are design decisions you must add:

```twf
workflow ProcessOrder(order: Order) -> (OrderResult):
    activity ValidateOrder(order) -> validated
    activity ChargePayment(order.payment) -> payment
        options:
            start_to_close_timeout: 30s   # bound the external charge call
            retry_policy:
                maximum_attempts: 3       # payment provider can be flaky
    workflow ShipOrder(order, payment) -> shipment
    close complete(OrderResult{shipment})
```

`twf check` → `✓ OK`. Structurally sound — now run the [Design Review](#design-review) before presenting.

**Long-running variant** — when a workflow loops over a large bound (or accumulates chunky per-iteration history), it must reach `close continue_as_new(...)` even though the loop is finite. A bound alone does not make history safe:

```twf
workflow ReindexCatalog(cursor: Cursor):
    pageCount = 0
    for:
        activity FetchPage(cursor) -> page
        activity IndexItems(page.items)
        cursor = page.next
        pageCount = pageCount + 1
        if (cursor == null):
            close complete
        # History grows per page — reset it before it gets large.
        if (pageCount >= 500):
            close continue_as_new(cursor)
```

### Design Review

A clean `twf check` (and, when it exists, `twf lint`) does **not** mean the design is correct. Idempotency of side effects, concurrent-write races, and cross-file payload data flow are invisible to the tooling and remain review concerns. Before presenting, do one **fresh-eyes pass**: re-read the finished design as if reviewing someone else's PR — set the prose/intent aside, or dispatch a reviewer that sees only the `.twf` artifacts. Self-review with the authoring mindset reproduces the author's blind spots; the value is in the *independence* of the second look, not its existence.

Grade against this rubric:

- **Call-site integrity** — every `activity` / `workflow` / `nexus` definition has at least one *structured* call site. A bare expression like `x = ActName(args)` parses as `raw` text and is silently **not** wired up — these orphans hide behind a clean `twf check`.
- **Reachability / dead code** — every workflow is reachable from a declared entry point via a call or Nexus op. Call out leftover/dead workflows; don't assume they're live.
- **Anti-pattern re-check** — walk the finished design against every entry in [anti-patterns.md](./reference/anti-patterns.md). Wrapper workflows, monoliths, and unbounded/bounded-but-large history are exactly what get copied in uncritically.
- **Idempotency** — each non-idempotent-by-nature activity states its idempotency strategy and key derivation (e.g. "workflow ID + activity name"). No tool validates this.
- **Concurrent writes to shared state** — does any parallel fan-out (`await all`, `for` + promises) have branches that write the same external blob/record? If so, state the isolation/keying assumption. TWF can't express it, so no tool can catch it — human-review-only.
- **Runtime / cost / lifecycle** — timeouts and retries set where failure can happen; history growth bounded (`continue_as_new` where needed); large payloads handled (see [anti-patterns.md](./reference/anti-patterns.md#large-payloads-in-workflow-state)).

### Revising an Existing Design

This is also the entry point when [Orient](#orient) surfaces prior work. Treat prior artifacts as **requirements**, not reference material. Run `twf symbols` to understand current structure, make edits, then re-enter the core loop (`twf check` → fix → [Design Review](#design-review) → repeat). Treat user feedback as new requirements — ask clarifying questions before editing if the feedback is ambiguous.

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

The design is ready to present when both gates pass.

**Grammar / structure gate** (does it parse, resolve, and deploy?):

1. `twf check` passes with no errors
2. `twf symbols` lists all expected workflows and activities
3. Worker/namespace topology validates (when present)

**Design-quality gate** (is it a good Temporal design?) — these are *not* checked by any tool:

4. All I/O, time, and randomness live in activities (determinism)
5. Activities are idempotent, with the strategy stated per side-effecting activity
6. Failure modes have recovery strategies
7. The [Design Review](#design-review) rubric passes (call-site integrity, reachability, anti-pattern re-check)

The design is **not** ready on a clean `twf check` alone — gates 4-7 are where Temporal design quality actually lives. For the full checklist: [design-checklist.md](./reference/design-checklist.md). For complex control flow, parallel execution, or signal/timer races, suggest the TWF visualizer extension. Present a summary alongside the `.twf` file: key workflows, activity purposes, and notable design decisions.

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
| Namespaces | Deciding namespace count / boundaries | [namespaces.md](./reference/namespaces.md) |
| Nexus | Cross-namespace communication | [nexus.md](./topics/nexus.md) |
Topic deep-dives are in `reference/` and `topics/` — consult as needed during design.
