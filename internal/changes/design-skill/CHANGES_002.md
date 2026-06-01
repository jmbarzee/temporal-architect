# Design Skill Changes: Independent Design-Quality Review Pass

> **Status: COMPLETED.** `SKILL.md` Design Flow now routes a clean `twf check` through a **Design Review** node (not straight to Done); Completion split into grammar/structure vs design-quality gates; a fresh-eyes Design Review rubric (call-site integrity, reachability, anti-pattern re-check, idempotency, concurrent-writes) added. `anti-patterns.md` gained a required re-check callout; `design-checklist.md` gained a validation-vs-review preamble and Design Review block.

**Source:** `reflect-skill` from `REFLECTION_DESIGN.md`
**Focus:** Stop gating the design on `twf check ✓ OK`. Add a required design-quality review pass — run with fresh-context framing — against a concrete rubric, including a re-check against the skill's own `anti-patterns.md`.

## Summary

The reflection's strongest, most reproducible finding: `twf check` validates grammar and resolution, not design quality. Every substantive problem in the Comparanda design (8 orphaned `x = ActName(args)` call sites parsing as `raw`, 11 wrapper-workflow instances copied uncritically, "pieces fine / whole off") was surfaced by an **independent** reviewer or by user pushback — never by the in-session author's own `write → check → fix` loop.

Two structural causes:

1. **The loop terminates on the nearest crisp signal.** `twf check ✓ OK` is authoritative and satisfying, so it displaces judgment (the metric becomes the target). The completion checklist puts `twf check` first, reinforcing it as the principal validation.
2. **Self-review reproduces the author's blind spots.** The value came from *fresh eyes*, not from "looking again." A critique step administered by the same author with the same vague prompts will get the same green light.

The fix is a required review pass that is (a) **independent / fresh-context** in framing and (b) graded against a **concrete rubric** of design-quality checks — not a generic "re-read your work."

> **Scope note:** This revision deliberately specifies the *review* as a reasoning pass the designer performs (or dispatches), not as new tooling. Automated detection of the classes below (e.g. orphan-call-site / reachability checks, a strict mode) is intentionally **deferred** to the separate `twf`-command-ergonomics discussion. The interim mechanism is the manual rubric here; if/when commands land, they replace the manual steps in the relevant rows.

## Group 1: Demote `twf check` From Success Terminator

**Findings:**

- `skills/design/SKILL.md:12-14` — Design Flow's core loop is `write → twf check → fix → repeat`, and the flowchart's only exit is `Error? → No → Done`. **Severity: High.** "Done" should not be reachable directly from a clean `twf check`. Insert a **Design Review** node between `twf check` clean and `Done`. The loop exits to review, not to done.
- `skills/design/SKILL.md:118-129` — Completion section lists `twf check` passes as criterion #1, implying it is the principal gate. **Severity: High.** Reframe: criteria 1-3 (`twf check`, `twf symbols`, topology) are *grammar/structure gates*; criteria 4-6 (determinism, idempotency, failure modes) plus the new rubric in Group 2 are the *design-quality gate*. Make explicit that the design is NOT ready on `twf check` alone.
- `skills/design/reference/design-checklist.md:4` — "TWF Validation" leads the checklist with `twf check passes`. **Severity: Medium.** Add a one-line preamble distinguishing "validation" (does it parse/resolve?) from "review" (is it a good Temporal design?), and point to the new review section (Group 2).

**Files touched:** `skills/design/SKILL.md`, `skills/design/reference/design-checklist.md`
**Change type:** `Internal`
**Parallelism:** SKILL.md and design-checklist.md edits are independent.

## Group 2: A Concrete Design-Review Rubric (Fresh-Eyes Pass)

**Findings:**

- The skill has no required step that re-reads the finished design *as if reviewing someone else's PR*. **Severity: High.** Add a "Design Review" subsection to `SKILL.md` (and a corresponding checklist block) that the designer runs before presenting. Frame it explicitly as a fresh-context pass — re-read the design with the prose/intent set aside, or dispatch a reviewer that sees only the artifacts. The rubric is the content that makes the pass non-empty:
  - **Call-site integrity** — every `activity`/`workflow`/`nexus` definition has at least one *structured* call site. Bare expressions like `x = ActName(args)` parse as `raw` text and are silently not wired up. (This is the exact class that hid 8 orphans behind a clean `twf check`.)
  - **Reachability / dead code** — every workflow is reachable from a declared entry point via call or Nexus op; leftover/dead workflows are called out, not assumed live.
  - **Anti-pattern re-check** — see Group 3.
  - **Cost & lifecycle** — deferred in detail to `REVISIONS_003`; the review pass cross-references it so the two land together.
  - **Concurrent writes to shared external state** — does any parallel fan-out (`await all`, `for` + promises) have branches that write the same external blob/record? If so, state the isolation/keying assumption. **No tool can catch this** — TWF can't express the isolation assumption, so `twf check` and a future `twf lint` are both blind to it; it's a human-review-only class (from `twf-language-limitations.md`). Pairs with the idempotency expectation in `core-principles.md` (skill backlog).
- **Severity: High** on framing: the rubric must be presented as *adversarial / fresh-eyes*, not "double-check your work." The reflection's evidence is that author self-review missed all of these; the structural fix is the independence, not the existence, of the second look.
- **Severity: Medium — a clean tool is not a finished design.** State plainly in the Design Review section that passing `twf check` (and, when it exists, `twf lint`) does **not** mean the design is correct: idempotency of side effects, concurrent-write races, and cross-file payload data flow are invisible to the tooling and remain review concerns. This is the thesis of the whole revision — the reflection failure was treating a green tool as "done" — so name the tool's blind spots explicitly rather than letting a clean run imply completeness.

**Files touched:** `skills/design/SKILL.md`, `skills/design/reference/design-checklist.md`
**Change type:** `Internal`
**Parallelism:** Depends on Group 1's structural reframe; do Group 1 first, then Group 2 in the same files.

## Group 3: Make Anti-Patterns a Required Re-Check, Not Reference

**Findings:**

- `skills/design/reference/anti-patterns.md` documents the relevant shapes the Comparanda design walked straight into — **Wrapper Workflow** (`anti-patterns.md:38-56`), **Unbounded History** (`anti-patterns.md:5-36`), **Monolithic** (`anti-patterns.md:58-84`), **Large Payloads** (`anti-patterns.md:86-102`). **Severity: High.** The doc exists and is correct; the skill never tells the designer to pattern-match the *finished* design against it. The 11 `BuildX → AgenticTask → FinalizeX` wrappers were copied from the archive without anyone re-opening this file.
- **Severity: Medium.** Add a short "Re-check pass" callout at the top of `anti-patterns.md` instructing the reader to walk each named anti-pattern against the design during the Group 2 review, and add an explicit checklist line: "Design re-checked against every anti-pattern in `anti-patterns.md`." Pattern-matching a design against a catalog of bad shapes is exactly what this pass is for.

**Files touched:** `skills/design/reference/anti-patterns.md`, `skills/design/reference/design-checklist.md`
**Change type:** `Internal`
**Parallelism:** Independent of Groups 1-2 except for the shared `design-checklist.md` line; coordinate the checklist edit.

## Severity Summary

| Severity | Count | Action |
|----------|-------|--------|
| High | 6 | Demote `twf check` to a grammar gate; add a fresh-eyes design-review pass with a concrete rubric (call-site integrity, reachability, anti-pattern re-check) |
| Medium | 3 | Checklist preamble; anti-pattern re-check callout + checklist line |

## Recommended Execution Order

1. **Group 1** — restructure the Design Flow exit and Completion framing so a clean `twf check` routes to review, not done.
2. **Group 2** — add the fresh-eyes Design Review rubric (call-site integrity + reachability), explicitly framed as adversarial.
3. **Group 3** — wire `anti-patterns.md` into that pass as a required re-check.
4. **Mirror** — sync `skills/design/` to `packages/vscode/skills/design/`.

## Deferred to `twf`-command discussion

- Automated orphan / bare-expression detection.
- A reachability command and/or a strict check mode that fails on the Group 2 rubric classes.
- A skill-side `bin/audit.sh` that runs the rubric mechanically.

These are intentionally not specified here; they are part of the broader command-ergonomics conversation.
