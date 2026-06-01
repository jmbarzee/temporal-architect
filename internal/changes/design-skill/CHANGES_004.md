# Design Skill Changes: Orient Before Drafting

> **Status: COMPLETED.** `SKILL.md` now opens the Design Flow with an **Orient** step (glance for existing `.twf`/`DESIGN.md`/`archive*/`; migration case noted), scopes "Write before you read" to *reference docs only* (prior artifacts are requirements), and links "Revising an Existing Design" back to Orient.

**Source:** `reflect-skill` from `REFLECTION_DESIGN.md`
**Focus:** "Write before you read" is tuned for analysis paralysis (a new designer reading every reference doc before starting). It misfires when prior *project artifacts* exist — those are requirements, not reference material. Add an orientation step and disambiguate the two kinds of "reading."

## Summary

A validated prior design existed at `archive-v1-attempt/` (6 `.twf` files + `DESIGN.md`). The skill's "Write before you read" pushed the designer straight into drafting from scratch; the archive was discovered ~20 minutes in, by going off-script. Drafting from scratch on top of validated prior work means re-deriving — and silently diverging from — boundaries, retry policies, and decompositions someone already debated and wrote down.

This is a **distinct root cause** from the early-termination problem in `REVISIONS_002`. A design can terminate review at exactly the right moment and still have started from the wrong place. The reflection's own "this is the structural root cause of every other finding" over-unifies; keep orientation separate.

The reframe: reading `notation-reference.md` is reading *reference material* (read lazily, to fix specific errors). Reading a prior `.twf` / `DESIGN.md` is reading *requirements* (read first). The skill conflates them under one "Write before you read" rule.

## Group 1: Add an Orientation Step Before the Design Flow

**Findings:**

- `skills/design/SKILL.md:12-43` — The Design Flow opens directly with the write→check→fix loop. **Severity: High.** Add a brief "Orient" step *before* the loop: check for prior work before drafting. Keep it lightweight — it is not a research phase, it is a discovery glance:
  - look for existing `.twf` files in the project,
  - look for prior design docs (`DESIGN.md`, `docs/`-style design notes, `archive*/` directories),
  - if found, read them as requirements and enter "Revising an Existing Design," not the from-scratch draft.
  Frame it so it does not reintroduce analysis paralysis: orientation is "is there prior work to build on?", not "read everything before writing."
- **Severity: Medium (migration framing).** Add one sentence making the migration case explicit: when the task is migrating an existing orchestration (Claude-Code → Temporal, cron → Temporal, etc.), the prior artifacts ARE the requirements; discovering and reading them is the first step, not a detour.

**Files touched:** `skills/design/SKILL.md`
**Change type:** `Internal`
**Parallelism:** Shares `SKILL.md` with `REVISIONS_002`/`003`; sequence the SKILL.md edits.

## Group 2: Disambiguate "Write Before You Read"

**Findings:**

- `skills/design/SKILL.md:16` — "**Write before you read.** Draft TWF from the workflow description ... Consult references only to fix specific errors, not to prepare." **Severity: High.** This is correct *for reference docs* and wrong *for project artifacts*. Edit the line to scope it explicitly: "Write before you read **the reference docs** — don't pre-read `notation-reference.md` et al. to prepare. This does **not** apply to prior project artifacts (existing `.twf`, `DESIGN.md`): those are requirements — read them first (see Orient)." A one-line distinction closes the gap without weakening the original intent.

**Files touched:** `skills/design/SKILL.md`
**Change type:** `Internal`
**Parallelism:** Same file as Group 1 — do together.

## Group 3: Strengthen "Revising an Existing Design"

**Findings:**

- `skills/design/SKILL.md:81-83` — "Revising an Existing Design" only fires *once you already hold the file path*; it assumes discovery has happened. **Severity: Medium.** Add a lead-in linking it to the Orient step: this subsection is also the entry point when orientation surfaces prior work. Reiterate "treat prior artifacts as requirements; run `twf symbols` to understand current structure before editing."

**Files touched:** `skills/design/SKILL.md`
**Change type:** `Internal`
**Parallelism:** Same file as Groups 1-2.

## Severity Summary

| Severity | Count | Action |
|----------|-------|--------|
| High | 2 | Add Orient step before the loop; scope "Write before you read" to reference docs only |
| Medium | 2 | Migration framing; connect "Revising an Existing Design" to Orient |

## Recommended Execution Order

1. **Group 2** — the one-line scoping edit (smallest, highest clarity-per-token).
2. **Group 1** — the Orient step.
3. **Group 3** — wire "Revising an Existing Design" to Orient.
4. **Mirror** — sync `skills/design/` to `packages/vscode/skills/design/`.
