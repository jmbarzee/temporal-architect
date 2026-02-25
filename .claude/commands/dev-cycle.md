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
   - "Resume" — check `changes/` for existing REVISIONS files and report current state
   - "Targeted" — specific component(s) only
2. Which **layers** should be reviewed this cycle?
   - DSL spec (`/review-quality-dsl-spec`)
   - Parser internals (`/review-quality-parser`)
   - Parser alignment (`/review-alignment-parser`)
   - Parser-visualizer contract (`/review-alignment-parser-visualizer`)
   - Visualizer spec (`/review-quality-visualizer-spec`)
   - Visualizer TypeScript (`/review-quality-visualizer`)
   - Visualizer alignment (`/review-alignment-visualizer`)
   - Design skill (`/review-quality-skill` for design)
   - Design skill alignment (`/review-alignment-design-skill`)
   - Author-go skill (`/review-quality-skill` for author-go)
   - Author-go alignment (`/review-alignment-author-skills`)
   - All of the above

Present the proposed review scope and **wait for confirmation** before starting.

### Phase 2: Discovery (Parallel)

Launch the confirmed review commands as parallel sub-agents. Each sub-agent runs its full workflow through to writing REVISIONS files in `changes/{component}/`.

Collect summaries from all sub-agents.

### Phase 3: Report

Present:
- Which REVISIONS files were created, by component
- Total groups and findings across all components
- Suggested execution order (respecting the dependency DAG)
- Whether to proceed manually (`/project:address-review` per REVISIONS file) or hand off to the automated orchestrator

**STOP. Wait for user to decide next steps.**

If the user wants to continue manually, recommend running `/project:address-review` with the specific REVISIONS file paths, followed by `/project:propagate-changes` after each component's CHANGES file is written.

If the user wants to run the automated workflow, the REVISIONS files in `changes/` are the input — start the DevCycleWorkflow.

## Approval Gates

| Gate | What you see | Decision |
|------|-------------|----------|
| Phase 1 end | Proposed review scope | Confirm or narrow scope |
| Phase 3 end | Discovery report | Manual execution, automated workflow, or close |

## Constraints
- **This command generates REVISIONS files only.** It does not execute changes, write CHANGES files, or propagate. Those are the domain of `address-review`, `propagate-changes`, and the orchestrator workflow.
- **Prefer narrow scope over broad.** It's better to review 2-3 focused layers than all 11 at once.
- **Respect the dependency DAG.** If parser changes are likely, review the parser first — downstream reviews may be invalidated by parser changes.
