# Reverse Engineering: Code → `.twf`

The dominant adoption path is not greenfield. Most teams already run Temporal code and want a `.twf` that captures what they have — to review it, refactor it, or hand it to the visualizer. Here the **implementation is the requirement** and the `.twf` is recovered from it.

Treat the recovered `.twf` as the **central, living design medium** — the artifact the team will keep editing and reviewing — not a throwaway sketch of the code. That framing sets the bar: capture the design faithfully enough that it's worth keeping.

This is a **parallel path** to the greenfield loop, kept separate on purpose. The main [SKILL.md](../SKILL.md) body carries only a thin trigger; the mechanics live here so the fast forward loop never pays for them. Discovery runs in an isolated [project-discovery subagent](./project-discovery-subagent.md) and returns a summary — the context-protection move.

## Trigger discipline

Reverse-engineer **deliberately, on a bounded slice** — one domain, one service, one set of entry points at a time. Never scan the whole repo reflexively. A slice keeps both the discovery subagent and the resulting `.twf` reviewable; a whole-repo sweep produces a `.twf` nobody can check.

## Two cases

### B1a — Bootstrap (no `.twf` yet)

The repo has Temporal code but no design file. Recover one from scratch:

1. **Discover** — dispatch the [project-discovery subagent](./project-discovery-subagent.md) on the bounded slice. It returns tooling, layout, SDK usage, registration style, and any impl-link comments.
2. **Extract** — translate the discovered workflows/activities/nexus into `.twf` (see [Reading strategy](#reading-strategy)).
3. **Fidelity check** — confirm the `.twf` matches what the code actually does (see [Fidelity first](#fidelity-first-then-design-review)).
4. **Design Review** — only now run the standard [Design Review](../SKILL.md#design-review).

Mirror the code's package layout: put each domain in its own [package](./twf-conventions.md#package-per-domain-directory) (a directory whose files share a `package` clause), `import` across packages for cross-domain references, and write the [impl-link header](./twf-conventions.md#impl-link-header) so the new `.twf` records where its implementation lives. Because packages let the `.twf` layout follow the code again, a recovered slice can sit beside the implementation directory it came from.

### B1b — Drift / sync (`.twf` exists but is stale)

A `.twf` exists but the code has moved on. Two halves, with different readiness:

- **Check (available now):** on a bounded slice, compare the `.twf` against current code and report divergences — missing activities, changed boundaries, dropped signals. This needs no new tooling.
- **Sync (deferred):** mechanically reconciling `.twf` ↔ implementation depends on the future twf↔impl mapping ([#24](https://github.com/jmbarzee/temporal-architect/issues/24) — reference annotations / `@ref`). Until that lands, reconcile by hand: re-extract the drifted slice (B1a steps 2-4) and update the `.twf`, treating the code as the source of truth for *behavior* and the existing `.twf` as the source of truth for *intent*.

## Reading strategy

Read for **design structure**, not line-by-line behavior:

- **Find entry points first** — client-started workflows, schedule-started workflows, Nexus-operation-backing workflows, handler-bearing workflows. These are the roots of the `.twf`.
- **Follow call sites** — `workflow.ExecuteActivity`, `workflow.ExecuteChildWorkflow`, Nexus operation calls. Each is an `activity` / `workflow` / `nexus` call in TWF.
- **Ignore the plumbing** — error wrapping, `context` threading, logging, options structs, retry/timeout boilerplate. None of it changes the design shape; capture only the options that express a real decision (a tuned timeout, a capped retry).
- **Detect parallelism** — `workflow.Go`, selectors (`workflow.NewSelector`), futures held and `.Get` later → `await all` / `await one` / `promise` in TWF. Sequential `.Get` right after the call is just a synchronous call.

### Delegate SDK reading to the author skill

Do not reconstruct SDK semantics yourself. The author skills already hold the DSL↔SDK mapping — **read their symbol tables backward.** For Go, use the `temporal-architect-author-go` references (e.g. `activity-call.md`, `workflow-call.md`, `await-all.md`) and, for generated code, its `reference/proto-driven.md` Rosetta Stone (generated `XxxActivities` iface, `RegisterXxxActivities`, `XxxFuture`, etc. → the underlying `activity`/`workflow`). Forward mappings (DSL → Go) read in reverse give you Go → DSL for free.

## Fidelity first, then Design Review

**Capture what the code does, faithfully — including its anti-patterns.** A wrapper workflow, a monolith, an unbounded loop: extract them *as they are*. The recovered `.twf` must mirror reality before it's worth reviewing; silently "fixing" during extraction produces a `.twf` that describes a system that doesn't exist, and hides the very problems the team needs to see.

- **Do not** refactor, rename, or "improve" during extraction.
- **Intent-fill only genuinely-unimplemented stubs** — a `// TODO` body, a panic-not-implemented, an empty handler. Mark these clearly; everything else is recovered, not invented.

Once the `.twf` faithfully reflects the code, run the standard [Design Review](../SKILL.md#design-review). That pass is where anti-patterns get *named and proposed for change* — separately from extraction, so the record of "what exists" stays honest and the "what should change" is an explicit, reviewable diff.
