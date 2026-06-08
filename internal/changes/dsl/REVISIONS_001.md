# DSL Revisions

**Source:** skill-retro planning session
(`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 3 — prioritized trio).

## Summary

Two grammar additions that unblock the harness's decomposition tooling and the North-Star worker
intent. The larger DSL designs (packages / cross-package refs, `@ref`, general `extern`, Nexus
endpoint access policy, custom search attributes) **remain in `BACKLOG.md`** — not promoted this cycle.

## Group 1: Entry Point Annotation

**Findings:**
- Tooling cannot compute reachability or identify composable workflow **trees** without declared
  **roots**. An entry-point marker is the prerequisite for the parser's reachability check *and* the
  harness's graph-tree decomposition (see `parser/REVISIONS_002`). Full design in `BACKLOG.md` →
  Annotations → *Entry Point Annotation*.

**Files touched:** `tools/spec/sections/` (grammar), `tools/lsp/parser/` (lexer/parser/AST), `tools/lsp/parser/ast/json.go`.
**Change type:** `Breaking` (new grammar) — pre-v1, fine.
**Parallelism:** Prerequisite for `parser/REVISIONS_002` Group 1 (reachability + trees).

**Specific changes:**
1. Add `@entry` (annotation) or `entry workflow Foo` (keyword) — pick per the backlog open question.
2. Parse + carry on the workflow AST node; emit in JSON. Handler-bearing and Nexus-op-backing workflows
   are *implicit* entries (don't flag as unreachable). Zero-entry files = libraries (no reachability warnings).

## Group 2: Worker Options (union, parser-permissive)

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
