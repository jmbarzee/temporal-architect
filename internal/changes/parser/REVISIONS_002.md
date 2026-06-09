# Parser Revisions

**Source:** skill-retro planning session
(`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 3 — prioritized trio).

## Summary

The permissive worker-options acceptance to match the DSL change. This cycle is worker-options only.

**Deferred from this cycle:** the *Reachability + Composable-Chunk / Tree Identification* group was
pulled. It had a **hard dependency** on the Entry Point Annotation grammar (`dsl/REVISIONS_001`), which
is itself deferred and being reframed as the general "connect in and out of Temporal" boundary concept
(see `dsl/BACKLOG.md` → *Connecting In and Out of Temporal*). With no roots in the language, root-based
reachability/tree decomposition cannot land as specced — the work stays in `parser/BACKLOG.md`
(*Reachability Check* and *Graph Decomposition*), where the chunk-identification strategy is being
sharpened (graph traversal for the basic case; loops and oversized trees as the harder open cases).

## Group 1: Worker-Options Permissive Acceptance

**Findings:**
- Match the DSL change (`dsl/REVISIONS_001` Group 1): resolver/validator accepts the SDK-union worker
  options with **no per-language check**.

**Files touched:** `tools/lsp/parser/validator/`, `tools/lsp/parser/resolver/` (as needed).
**Change type:** `Internal`.
**Parallelism:** Independent; pairs with `dsl/REVISIONS_001` Group 1.

**Specific changes:**
1. Permit the expanded worker-option keys without emitting unknown-key errors; no language gating.
