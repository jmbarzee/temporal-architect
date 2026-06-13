# Orchestrate Full Development Cycle

Generate the initial REVISIONS files that feed the automated workflow loop. This command is the human entry point — it runs scoped reviews to discover work, then hands off to the orchestrator (or manual `address-review` + `propagate-changes` invocations).

## The Loop

```
[Scope] → [Discover] → [Group] → [Write REVISIONS] → hand off to workflow or manual execution
```

## Workflow

### Phase 1: Scope

Before launching any reviews, ask the user:
1. What is the **starting point**? Options:
   - "Fresh cycle" — full review from scratch
   - "Resume" — check `internal/changes/` for existing REVISIONS files and report current state
   - "Targeted" — specific component(s) only
2. Which **layers** should be reviewed this cycle?
   - DSL spec (`internal/harness/commands/review-quality-dsl-spec.md`)
   - Parser internals (`internal/harness/commands/review-quality-parser.md`)
   - Parser alignment (`internal/harness/commands/review-alignment-parser.md`)
   - Parser-visualizer contract (`internal/harness/commands/review-alignment-parser-visualizer.md`)
   - Visualizer spec (`internal/harness/commands/review-quality-visualizer-spec.md`)
   - Visualizer TypeScript (`internal/harness/commands/review-quality-visualizer.md`)
   - Visualizer alignment (`internal/harness/commands/review-alignment-visualizer.md`)
   - Design skill (`internal/harness/commands/review-quality-skill.md` for design)
   - Design skill alignment (`internal/harness/commands/review-alignment-design-skill.md`)
   - Author-go skill (`internal/harness/commands/review-quality-skill.md` for author-go)
   - Author-go alignment (`internal/harness/commands/review-alignment-author-skills.md`)
   - All of the above

Present the proposed review scope and **wait for confirmation** before starting.

### Phase 2: Discovery (Parallel)

Launch the confirmed review commands as parallel sub-agents. Each sub-agent runs its full workflow through to writing REVISIONS files in `internal/changes/{component}/`.

Collect summaries from all sub-agents.

### Phase 3: Report

Present:
- Which REVISIONS files were created, by component
- Total groups and findings across all components
- Suggested execution order (respecting the dependency DAG)
- Whether to proceed manually (`internal/harness/commands/address-review.md` per REVISIONS file) or hand off to the automated orchestrator

**STOP. Wait for user to decide next steps.**

If the user wants to continue manually, recommend running `internal/harness/commands/address-review.md` with the specific REVISIONS file paths, followed by `internal/harness/commands/propagate-changes.md` after each component's CHANGES file is written.

If the user wants to run the automated workflow, the REVISIONS files in `internal/changes/` are the input — start the DevCycleWorkflow.

## Approval Gates

| Gate | What you see | Decision |
|------|-------------|----------|
| Phase 1 end | Proposed review scope | Confirm or narrow scope |
| Phase 3 end | Discovery report | Manual execution, automated workflow, or close |

## Constraints
- **This command generates REVISIONS files only.** It does not execute changes, write CHANGES files, or propagate. Those are the domain of `address-review`, `propagate-changes`, and the orchestrator workflow.
- **Prefer narrow scope over broad.** It's better to review 2-3 focused layers than all 11 at once.
- **Respect the dependency DAG.** If parser changes are likely, review the parser first — downstream reviews may be invalidated by parser changes.
