# Design Skill Changes

**Source review(s):** skill-retro planning session (Stage 1)
**REVISIONS file(s):** `internal/changes/design-skill/REVISIONS_002.md` (Groups 1–3)

## Summary

The design skill was forward-only (description → `.twf`) and silent on the reverse direction
(existing code → `.twf`), the dominant adoption path. This cycle adds reverse engineering as a
**subagent-driven parallel path** (kept out of the fast greenfield loop), defines a **shared
project-discovery subagent** reused by author-go and the future author-infra, and documents `.twf`
placement (one package) plus a small named set of comment conventions. No DSL or tooling changes —
placement uses comment conventions; the durable DSL forms (packages, `@ref`) stay deferred in
`dsl/BACKLOG.md`.

## Changes by Type

### Internal

- **`skills/temporal-architect-design/reference/project-discovery-subagent.md`** (new): shared
  "scan an existing repo on a bounded slice, return a compact summary" primitive. Defines inputs
  (repo root, bounded slice, focus), scan targets (build/codegen tooling, layout, Temporal SDK usage,
  registration style, `.twf`/`.tf` presence, comment conventions), compact-summary output, deliberate
  trigger discipline, and a copy-pastable agent definition. Reconciles with author-go's `sdk-explorer`
  sketch — it is the broadened, shared form, answering that doc's "should it scan project conventions?"
  open question. **Cross-skill contract:** referenced by author-go existing-repo Orient
  (`author-go-skill/REVISIONS_001` Group 1) and the future author-infra.
- **`skills/temporal-architect-design/reference/reverse-engineering.md`** (new): the code → `.twf`
  mechanics. Frames `.twf` as the central living design medium; covers B1a bootstrap (discover →
  extract → fidelity → Design Review) and B1b drift/sync (independent *check* half now; *sync* half
  deferred to the future twf↔impl mapping); reading strategy (entry points + call sites, ignore
  plumbing, detect parallelism); delegates SDK-symbol reading *backward* to the author skills
  (incl. author-go's forthcoming `reference/proto-driven.md`); fidelity-first-then-Design-Review with
  stub handling.
- **`skills/temporal-architect-design/reference/twf-conventions.md`** (new): one-package placement
  recommendation (presented as *the* recommendation; "interim" framing stays in `dsl/BACKLOG.md`)
  plus two comment conventions defined in one place — the impl-link header (`# impl: <dirs>`) and the
  cross-domain stub marker (`# cross-domain stub — defined in X.twf`), each with a `twf check`-passing
  example.
- **`skills/temporal-architect-design/SKILL.md`**: extended `Orient` with a thin reverse-path trigger
  (deliberate, bounded slice; dispatches the discovery subagent; rejoins the core loop at Design
  Review). Added three Reference Index rows for the new docs.

## Notes

- Reverse engineering is delivered as a parallel path on purpose: the `SKILL.md` body carries only the
  trigger, so the greenfield loop pays nothing for it, and discovery runs in an isolated subagent that
  returns only a summary (context protection).
- The cross-domain stub marker documents the existing nexus resolution cliff in `common-errors.md`
  (one local `nexus service` turns every other service reference into a hard error). No tooling change
  — the marker is a reader/discovery aid until an explicit external marker exists.
