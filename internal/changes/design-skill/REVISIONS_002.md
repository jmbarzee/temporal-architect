# Design Skill Revisions

**Source:** skill-retro planning session
(`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 1).
**Reflection:** `lessons_from_skills_on_existing_project.md` (reverse-engineering existing Go → `.twf`).

## Summary

The design skill is written for the forward direction (description → `.twf`) and is silent on the
*reverse* direction (existing code → `.twf`), which is the dominant adoption path. This cycle adds
reverse-engineering as a **subagent-driven parallel path** (so it never pollutes the fast greenfield
loop), defines the **shared project-discovery subagent** (reused by `author-go` Orient and
`author-infra`), and resolves `.twf` placement (one package + an implementation-link comment
convention). No DSL changes — placement uses comment conventions; the durable DSL forms (packages,
`@ref`) stay deferred in `dsl/BACKLOG.md`.

## Group 1: Reverse engineering (code → `.twf`) as a subagent parallel path (B1)

**Findings:**
- Frame `.twf` as the **central, living design medium**, not a throwaway sketch. Deliver reverse
  engineering as a **parallel path**: the main skill body carries only a thin trigger + optional
  subagent dispatch; the reverse *mechanics* live in a reference + the subagent prompt. This is the
  anti-pollution mechanism and the North-Star context-protection move (discovery runs isolated,
  returns a summary). **Trigger discipline:** deliberate, on bounded slices, never reflexively.
- Two cases: **B1a Bootstrap** (no `.twf`) — discover → extract → fidelity → Design Review;
  **B1b Drift/sync** (`.twf` incomplete/desynced) — check/sync on a bounded slice → reconcile (the
  *sync* half depends on the future twf↔impl mapping, `dsl/BACKLOG.md` Reference Annotations; the
  *check* half is independent).
- **Fidelity-first, THEN the existing Design Review:** capture what the code does faithfully (including
  anti-patterns) — do not silently "fix" during extraction. Intent-fill only genuinely-unimplemented
  stubs. **Delegate SDK reading to the relevant author skill** (read its symbol tables — incl.
  `author-go/references/proto-driven.md` — *backward*).

**Files touched:** `skills/temporal-architect-design/SKILL.md` (thin trigger + Orient extension),
`skills/temporal-architect-design/reference/reverse-engineering.md` (new; reading strategy + subagent prompt).
**Change type:** `Internal`
**Parallelism:** Group 2 (B1c subagent) is a prerequisite for the discovery half; Group 3 independent.

**Specific changes:**
1. Extend `Orient` to cover "the source of truth is existing code" and route to the reverse path.
2. New `reference/reverse-engineering.md`: reading strategy (find entry points + activity/child/nexus
   call sites; ignore error/ctx/options plumbing; detect parallelism), delegate-to-author-skill,
   fidelity-then-review, stub handling.
3. Wire B1a/B1b to dispatch the shared discovery subagent (Group 2) on bounded slices.

## Group 2: Shared project-discovery subagent (B1c)

**Findings:**
- A single primitive — "scan an existing repo for tooling / layout / conventions / Temporal usage on
  a bounded slice, return a summary" — serves **author-go** existing-repo Orient (`author-go-skill/REVISIONS_001`
  Group 1), **B1a bootstrap**, **B1b drift-check**, and later **author-infra**. Matches
  `author-go/SUBAGENT_ADOPTION.md`'s `sdk-explorer` open question. Design once, reuse.

**Files touched:** shared subagent prompt/spec (owned here; referenced by author-go + author-infra).
**Change type:** `Internal`
**Parallelism:** Prerequisite for Group 1 discovery + author-go Orient.

**Specific changes:**
1. Define the discovery subagent: inputs (repo root, bounded slice), what it scans (build/codegen
   tooling, package layout, Temporal SDK usage, registration style, `.twf`/`.tf` presence,
   impl-link comments), output (compact summary). Deliberate-trigger guidance baked in.

## Group 3: `.twf` placement + comment conventions (B2)

**Findings:**
- Recommend **one package** for all `.twf` (present as the recommendation — do NOT frame as temporary
  in skill prose). Mapping mechanism: a **top-of-file comment linking each `.twf` to its implementation
  dir(s)** — restores the twf↔impl link one-package layout otherwise loses. Doubles as a
  reverse-engineering aid (discovery reads it; extraction writes it). Joins
  `# cross-domain stub — defined in X.twf` as a small, named set of `.twf` comment conventions.

**Files touched:** `skills/temporal-architect-design/SKILL.md` (or a short `reference/twf-conventions.md`).
**Change type:** `Internal`
**Parallelism:** Independent.

**Specific changes:**
1. Document the one-package recommendation.
2. Define the two comment conventions (impl-link header; cross-domain stub marker) in one place.
