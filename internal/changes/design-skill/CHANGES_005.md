# Design Skill Changes: Namespace Topology Guidance

> **Status: COMPLETED.** New `reference/namespaces.md` (decision ladder: default one; organizational not architectural; explicit not-reasons; two-layer-agent worked judgment). Cross-references added from `nexus.md` and `task-queues.md`; Reference Index row and a namespace-count checklist line added.
>
> **Deviation from "new `topics/namespaces.md`":** placed in `reference/`, not `topics/`. The content is a cross-cutting decision ladder (spanning workers/nexus/task-queues), structurally a sibling of `reference/workflow-boundaries.md` — not a single-construct deep-dive — and it doesn't carry a compelling standalone example, so the topology is **inlined** as a `twf` block rather than shipped as a companion `namespaces.twf`.

**Source:** `reflect-skill` from `REFLECTION_DESIGN.md`
**Focus:** The skill gives no guidance on namespace *count*. With no heuristic, the design drifted to one namespace per worker (6). Add a decision ladder establishing that namespaces are an organizational/operational boundary, not an architectural one.

## Summary

> **Scope (per review):** the *final* topology — two namespaces with Nexus — was a fine outcome; this revision is **not** about the end state. The gap is the **initial drift**: the design started at one namespace **per worker** (6), even though the relevant workflows were fairly *tightly coupled*. The skill offered no early signal that coupling does not justify a namespace, so the design had to be talked back down. Target the *starting point*, not the destination.

The designer created 6 namespaces — one per worker — and the user had to push back ("a namespace per worker is probably an overuse of namespaces"). The correct two-namespace-with-Nexus topology was reached via pushback, not via the skill. The skill frames the worker/namespace decision purely as a task-queue concern and never states the load-bearing rule:

> **Namespaces are organizational, not architectural.** Agent/tool scoping is solved by worker registration; runtime heterogeneity by task queues; layer separation by workflow boundaries. None of those justify a namespace. Only **team boundaries, security contexts, deployment lifecycle, and external service contracts** do.

A careful reader can derive this from `nexus.md`'s "When to Use Nexus" table (cross-team, different security contexts). A hurried reader drifts to "one namespace per layer → one per worker." The skill should make the default explicit and require justification to add.

## Group 1: New `topics/namespaces.md` With a Decision Ladder

**Findings:**

- There is no `skills/design/topics/namespaces.md`; namespaces appear only as deployment syntax in `notation-reference.md` and as a Nexus prerequisite. **Severity: High.** Add a focused topic with a decision ladder:
  - **Default: one namespace.** Start here.
  - **Add a namespace only when one of these demands it:** a distinct team owns the workflows; a different security/compliance context applies; an independent deployment lifecycle (separate release cadence/blast radius); or an external service contract crosses an org boundary (the Nexus case).
  - **Explicitly NOT reasons to add a namespace:** different worker / runtime (use task queues), agent or tool scoping (use worker registration), layer separation (use workflow boundaries), **one-per-worker by default**, "it feels cleaner." Call out the exact drift seen here: *tightly-coupled workflows belong in the same namespace* — coupling is an argument for co-location, not separation.
  - A short worked judgment on the Comparanda shape: inner-agent vs outer-agent tool scoping is worker registration, not a namespace boundary; the legitimate split is the org/service contract between the two layers → two namespaces with Nexus.

**Files touched:** new `skills/design/topics/namespaces.md` (+ optional `namespaces.twf` example to match the topic-file convention)
**Change type:** `Internal`
**Parallelism:** New file — fully independent.

## Group 2: Cross-Reference From Nexus and Task Queues

**Findings:**

- `skills/design/topics/nexus.md:7-15` — The "When to Use Nexus" table implies the namespace-count rule (cross-team / different security context) but never states it as a count heuristic. **Severity: Medium.** Add a one-line pointer to `namespaces.md` ("Deciding how many namespaces? See namespaces.md — the default is one") so the Nexus decision table links to the count decision.
- `skills/design/topics/task-queues.md` — **Severity: Medium.** The worker/namespace decision is framed here as a task-queue concern. Add the explicit statement that *different runtimes do not require different namespaces — use task queues*, with a pointer to `namespaces.md`. This is the exact misconception that produced namespace-per-worker.

**Files touched:** `skills/design/topics/nexus.md`, `skills/design/topics/task-queues.md`
**Change type:** `Internal`
**Parallelism:** Independent of Group 1 once the new file exists.

## Group 3: Surface It in the Index and Checklist

**Findings:**

- `skills/design/SKILL.md:139-156` — Reference Index has no namespaces row. **Severity: Low.** Add `Namespaces | Deciding namespace count / boundaries | topics/namespaces.md`.
- `skills/design/reference/design-checklist.md:38-43` — "Deployment Topology" checks worker groupings and task queues but not namespace count. **Severity: Low.** Add a line: "Namespace count justified by org / security / lifecycle / external-contract boundaries (default: one)."

**Files touched:** `skills/design/SKILL.md`, `skills/design/reference/design-checklist.md`
**Change type:** `Internal`
**Parallelism:** Shares `design-checklist.md` with `REVISIONS_002`/`003`; batch checklist edits across all four revision docs.

## Severity Summary

| Severity | Count | Action |
|----------|-------|--------|
| High | 1 | New `namespaces.md` decision ladder (default one; namespaces are organizational) |
| Medium | 2 | Cross-references from `nexus.md` and `task-queues.md` |
| Low | 2 | Reference index row; checklist line |

## Recommended Execution Order

1. **Group 1** — write `namespaces.md` (the substance).
2. **Group 2** — link it from `nexus.md` and `task-queues.md`.
3. **Group 3** — index + checklist surfacing.
4. **Mirror** — sync `skills/design/` to `packages/vscode/skills/design/`.
