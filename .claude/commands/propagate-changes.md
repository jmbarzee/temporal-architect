# Fan Out Reviews from CHANGES File

Read completed CHANGES files and fan out targeted reviews to all affected downstream layers.

This command answers: "changes were made — what else needs to review and update?"

**No CHANGES file?** If drift accumulated without documentation (spec evolved while implementation was paused, or changes were made without running the full cycle), skip this command. Run the relevant review command directly — it will detect the gap and produce a REVISIONS file. `address-review` then generates the CHANGES file at the end of that cycle. The review commands are the recovery mechanism when CHANGES files are missing.

## Dependency Map

Changes propagate along this graph. Each edge has a contract type:

```
DSL grammar (LANGUAGE_SPEC.md)
  └─► Parser (tools/lsp/)
        │  Grammar → DSL_CHANGES.md triggers: review-alignment-design-skill
        │  Schema  → PARSER_OUTPUT_CHANGES.md triggers: review-quality-visualizer, review-quality-visualizer-spec
        │  API     → triggers: review-quality-visualizer (TS types)
        ├─► LSP Server (tools/lsp/internal/server/)
        │     API/Semantic → triggers: review-quality-parser
        ├─► Visualizer (tools/visualizer/)
        │     Schema → triggers: review-quality-visualizer, review-quality-visualizer-spec
        ├─► Skill: Design (skills/design/)
        │     Grammar/Semantic → triggers: review-alignment-design-skill
        │     └─► Skill: Author-Go (skills/author-go/)
        │           Grammar/Semantic → triggers: review-alignment-author-skills
        └─► VS Code Extension (packages/vscode/)
              Schema/API → flag for manual review (no automated command)
```

## Workflow

### Phase 1: Read CHANGES File

A specific CHANGES file must be provided in context (e.g., `PARSER_CHANGES.md`). If none is provided, list all `*_CHANGES.md` files at the repo root and ask the user to select one.

Read the specified file and extract:
- Source review command
- Changes by type: `Grammar`, `Schema`, `API`, `Semantic`, `Internal`
- Specific changes listed under each type

If the file contains only `Internal` changes, report that, delete the CHANGES file, and stop — no downstream reviews are needed.

### Phase 2: Build Propagation Map

For each non-internal change, map to downstream layers using the dependency graph above. Build a table:

| CHANGES file | Change type | Downstream layer | Review command |
|---|---|---|---|
| PARSER_REVISIONS | Schema | Visualizer | review-quality-visualizer |
| DSL_REVISIONS | Grammar | Skills | review-alignment-design-skill |
| ... | | | |

Deduplicate: if the same review command is triggered by multiple change files, merge the context — one sub-agent handles all relevant changes for that layer.

### Phase 3: Fan Out

Launch one sub-agent per downstream review. Each sub-agent:
1. Runs the specified review command
2. Receives the relevant changes as additional context: "Focus this review on the impact of these specific changes: [list]"
3. Follows the review command's full workflow — Explore → Catalog → Group → Write REVISIONS file

Sub-agents run in parallel where the downstream layers are independent.

**Do not wait for sub-agents to complete before reporting Phase 3 has started.**

### Phase 4: Report

When all sub-agents complete:

1. Delete the CHANGES file. It has been fully consumed — the REVISIONS files are now the active artifacts.
2. Report:
   - Which REVISIONS files were created
   - Which layers had no impact (changes didn't affect them)
   - Which layers were skipped because an open REVISIONS file already exists
   - Any VS Code Extension impacts that need manual review
   - Recommended order for running `/project:address-review` on each REVISIONS file

If every triggered review was skipped (all layers already have open REVISIONS files), report that — no new work was queued, but the CHANGES file is still deleted.

**STOP. Present the report and wait for the user to begin addressing each new revision file.**

## Constraints
- **CHANGES files are inputs, not outputs.** Don't modify them. Don't create new ones here.
- **Sub-agents write REVISIONS files, not you.** Your output is the propagation report.
- **Internal-only changes stop here.** No downstream reviews needed.
- **Don't re-run reviews for layers that already have an open REVISIONS file.** Check for existing `*_REVISIONS.md` at root before launching a sub-agent for that layer.
