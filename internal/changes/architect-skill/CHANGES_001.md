# Architect (Entry-Point) Skill Changes

**Source review(s):** skill-retro planning session (Stage 4 / item E0), plus review feedback on the
implementation plan.
**REVISIONS file(s):** `internal/changes/architect-skill/REVISIONS_001.md` (Groups 1–5, consumed).

## Summary

Ships the **`temporal-architect`** umbrella entry-point skill — the Stage 4 capstone. The skill set has
no always-on user-side AGENTS file, so the front door is an entry-point skill whose broad `description`
makes it load first. It carries the North Star, orients the work, decomposes a `.twf` design at contract
boundaries, and routes to the specialists (`-design`, `-author-go`, `-author-infra`). Routing/orchestration
is pulled out of `design`, which shrinks back to "produce/review `.twf`."

Several reframes landed on top of the original REVISIONS, from review feedback:

- **The skills are now one dev-cycle component.** Rather than register the architect as a fourth per-skill
  node, design + the two authors + the architect collapse into a single downstream `skills` component
  (their internal dependencies flow many directions and don't belong as DAG edges).
- **Flow selection became direction-based.** The four flows are reframed as the two directions the
  design↔code edge traverses (`.twf`→code forward authoring; code→`.twf` recovery/reconciliation),
  modulated by situation (greenfield / existing-no-`.twf` / `.twf`-present / drift).
- **Decomposition rides `twf graph chunks`** (un-deferred, `parser/REVISIONS_005`) instead of a deferred
  seam, with a connected-component manual fallback. Dispatch is a progressive PERT over the tool's
  dependency DAG, not a global signature freeze.
- **Routing is flexible advice, not a rigid load rule**, including hosting `design` in the main agent for
  collaborative work, and loading both authors at a genuine language boundary.

## Changes by Type

### Internal

- **`skills/temporal-architect/SKILL.md`** (new): the umbrella entry-point skill.
  - **Description** is the broad de-facto trigger ("designing, building, adopting, or evolving Temporal
    systems — start here"); auto-invokes (no `disable-model-invocation`).
  - **North Star** section is the user-facing home for the philosophy (system-scale not code-scale;
    deterministic harness; keep the AI out of the weeds; context-protecting harness for the main agent),
    lifted from the REVISIONS rationale / `AGENTS.md`.
  - **Orient** keys the work on direction (A: `.twf`→code; B: code→`.twf`) × situation, with cheap
    detection signals and the steady-state rule "edit the `.twf` first, propagate forward." Drift is named
    as an open detection problem pointing at author-skill verify and sampler-on-production; reconciliation
    routes back through the `.twf`.
  - **Decompose** consumes `twf graph chunks`: #1 hard boundaries (MUST dispatch separate subagents),
    #2 soft divisions (MAY use; only over `--ceiling N`), floor, loop/SCC handling, heuristic roots, and a
    manual `twf symbols` fallback.
  - **Dispatch** is progressive: pin contracts only at hard-boundary/cross-language cuts, loose API
    suggestions elsewhere, PERT walk over the dependency DAG, and **selective dispatch** that skips
    unchanged chunks via the `# impl: <dirs>` link + the author skill's fast verify.
  - **Route** is advice with a default (`design` + one language author + optional `author-infra`) and
    named exceptions (skip design for pure implementation; host design in the main agent for collaborative
    design; both authors at a language boundary, framed as a confusability concern not a hard ban);
    `@lang` is the future dispatch key.
- **`skills/temporal-architect/reference/decomposition.md`** (new): the detailed protocol for reading
  `twf graph chunks` output (command + flags, #1/#2 handling, floor/ceiling, roots + edge semantics,
  selective dispatch against existing code, contract pinning, manual fallback).
- **`skills/temporal-architect-design/SKILL.md`**: trimmed the `## Handoff` section — multi-skill
  routing/orchestration moved into the architect; design's Handoff is now "produce/review `.twf`; the
  `temporal-architect` skill routes implementation," and notes design may run in the main agent (collaborative) or as a
  reviewer subagent.
- **`internal/harness/components.md`**: collapsed `design-skill` / `author-go-skill` /
  `author-infra-skill` into a single downstream `skills` component (source scope `skills/`, per-skill
  coordination subdirs retained). Design→author propagation is now intra-component; parser's downstream
  + propagation rows retarget `design-skill`→`skills`; wave ordering collapses to `Wave 2: ... skills`;
  the architect-skill exclusion note is dropped (orchestrator stays excluded).
- **`.claude/skills/dev-cycle/SKILL.md`**: updated the illustrative validation-table skill list to
  reference the single `skills` component.
- **`internal/changes/temp-change-set/chunks/BACKLOG.md`**: added a chunks-consumer backlog item —
  "chunk ↔ existing-impl reconciliation + cheap implementation-status check" — capturing the gap the
  architect currently bridges with a build/test stopgap.

## Notes

- **Deferred this cycle:** a dedicated `review-alignment-architect-skill` prompt (does the architect route to
  the specialists' real flows/languages?) was not built — per the "single component / less plumbing"
  steer, the architect is covered by `review-quality-skill`. The routing-accuracy gap is flagged here as a
  follow-up.
- **Out of scope (F2/F3, prompt 2 "reposition" work):** echoing the North Star in the main `README` and
  the published package descriptions. The dev-repo `AGENTS.md` North Star (F1) already exists.
- `twf graph chunks` lands in parallel (`parser/REVISIONS_005`). The skill prefers it and falls back to a
  manual connected-component enumeration so it is useful before the subcommand ships; adopting the tool
  later changes the input, not the dispatch protocol.
