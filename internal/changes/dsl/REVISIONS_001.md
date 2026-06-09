# DSL Revisions

**Source:** skill-retro planning session
(`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 3 — prioritized trio).

## Summary

One grammar addition this cycle: the North-Star worker intent. The larger DSL designs (packages /
cross-package refs, `@ref`, general `extern`, Nexus endpoint access policy, custom search attributes)
**remain in `BACKLOG.md`** — not promoted this cycle.

**Deferred from this cycle:** the *Entry Point Annotation* group was pulled — the narrow `@entry`
marker is being reframed as a general "connect in and out of Temporal" boundary concept (inbound
triggers + outbound "declared elsewhere"). See `BACKLOG.md` → *Connecting In and Out of Temporal*.
With no language change, the dependent parser reachability/tree work (`parser/REVISIONS_002` Group 1)
is also deferred to `parser/BACKLOG.md`.

## Group 1: Worker Options (union, parser-permissive)

**Findings:**
- TWF worker options = the **union/superset of SDK worker options** (excluding per-language one-offs).
  Keep it simple: **accept all worker options with no per-language validation**. Express
  strategy/intent at altitude (e.g. `versioning: build-id`), not numeric ops tuning. Full context in
  `BACKLOG.md` → Deployment Topology → *Worker Runtime Options and Versioning / Deployment*.

**Files touched:** `tools/spec/sections/` (worker options list), `tools/lsp/parser/parser/options.go`.
**Change type:** `Internal` (additive option keys).
**Parallelism:** Independent. Resolver-side permissive acceptance tracked in `parser/REVISIONS_002` Group 2.

**Specific changes:**
1. Extend the allowed worker-options schema to the SDK union (concurrency caps, rate limiters, sticky
   cache, versioning strategy, etc.).
2. No language-conditional validation — SDK quirks/missing options do not gate inclusion.
