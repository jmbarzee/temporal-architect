# Parser Revisions

**Source:** skill-retro planning session
(`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 3 — prioritized trio).

## Summary

Analysis features that turn the resolved graph into the harness's decomposition primitive, plus the
permissive worker-options acceptance to match the DSL change. Depends on Entry Point Annotation
(`dsl/REVISIONS_001` Group 1) for roots.

## Group 1: Reachability + Composable-Chunk / Tree Identification (E2)

**Findings:**
- The harness decomposes a `.twf` into independently-implementable chunks; the natural units are
  **independent workflow trees** (components rooted at entry points). `parser/graph/` already extracts
  the resolved graph, so identifying trees/components is a cheap traversal extension. Surface it as a
  tool the AI calls. Full design in `BACKLOG.md` → *Graph Decomposition: Composable Chunks / Workflow
  Trees* and *Reachability Check*.

**Files touched:** `tools/lsp/parser/graph/`, `tools/lsp/cmd/twf/graph.go` (+ envelope/schema).
**Change type:** `Internal` (additive).
**Parallelism:** **Hard dependency** on `dsl/REVISIONS_001` Group 1 (Entry Point Annotation) for roots.

**Specific changes:**
1. Reachability: walk from declared/implicit entries; flag unreachable workflows; treat handler-bearing
   + Nexus-op-backing workflows as roots.
2. Tree/component identification: enumerate independent trees (roots + reachable children).
3. CLI surface: `twf graph trees` / `twf graph chunks --by tree|worker|namespace`; optional
   decomposition strategies (parallelize independent branches, break out by worker/namespace) as
   AI-selectable suggestions.

## Group 2: Worker-Options Permissive Acceptance

**Findings:**
- Match the DSL change (`dsl/REVISIONS_001` Group 2): resolver/validator accepts the SDK-union worker
  options with **no per-language check**.

**Files touched:** `tools/lsp/parser/validator/`, `tools/lsp/parser/resolver/` (as needed).
**Change type:** `Internal`.
**Parallelism:** Independent of Group 1; pairs with `dsl/REVISIONS_001` Group 2.

**Specific changes:**
1. Permit the expanded worker-option keys without emitting unknown-key errors; no language gating.
