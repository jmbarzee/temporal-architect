# Fan Out Reviews from CHANGES File

Read completed CHANGES files and fan out targeted reviews to all affected downstream layers.

This command answers: "changes were made — what else needs to review and update?"

**No CHANGES file?** If drift accumulated without documentation (spec evolved while implementation was paused, or changes were made without running the full cycle), skip this command. Run the relevant review command directly — it will detect the gap and produce a REVISIONS file. `address-review` then generates the CHANGES file at the end of that cycle. The review commands are the recovery mechanism when CHANGES files are missing.

## Dependency Map

Changes propagate along the graph defined in `internal/harness/components.md` — the single
source of truth. Use its **Propagation routing** table (source component + change type →
downstream component + triggered review) to build the propagation map below. Do not restate
the graph from memory.

## Workflow

### Phase 1: Read CHANGES File

A specific CHANGES file path must be provided (e.g., `internal/changes/parser/CHANGES_001.md`). If none is provided, scan all `internal/changes/*/CHANGES_*.md` files and ask the user to select one.

Read the specified file and extract:
- Source review command
- Changes by type: `Grammar`, `Schema`, `API`, `Semantic`, `Internal`
- Specific changes listed under each type

If the file contains only `Internal` changes, report that and stop — no downstream reviews are needed. Do **not** delete the CHANGES file.

### Phase 2: Build Propagation Map

For each non-internal change, map to downstream layers using the dependency graph above. Build a table:

| CHANGES file | Change type | Downstream component | Review command |
|---|---|---|---|
| internal/changes/parser/CHANGES_001.md | Schema | visualizer | review-quality-visualizer |
| internal/changes/dsl/CHANGES_001.md | Grammar | design-skill | review-alignment-design-skill |
| ... | | | |

Deduplicate: if the same review command is triggered by multiple change types, merge the context — one sub-agent handles all relevant changes for that layer.

### Phase 3: Fan Out

For each downstream layer in the propagation map, check whether an existing REVISIONS file already covers this propagation:

- Read any existing `*_REVISIONS_*.md` files in `internal/changes/{downstream-component}/`.
- If an existing file's **Source** field references the same CHANGES file being propagated, skip that layer — the impact is already tracked.
- Otherwise, launch a sub-agent regardless of how many REVISIONS files already exist. REVISIONS files are numbered for a reason; a pre-existing file from a different source is unrelated pending work, not a duplicate.

Each sub-agent:
1. Runs the specified review command
2. Receives the relevant changes as additional context: "Focus this review on the impact of these specific changes: [list]"
3. Follows the review command's full workflow — Explore → Catalog → Group → Write REVISIONS file to `internal/changes/{downstream-component}/` using the next available sequence number

Sub-agents run in parallel where the downstream layers are independent.

**Do not wait for sub-agents to complete before reporting Phase 3 has started.**

### Phase 4: Report

When all sub-agents complete:

1. Report:
   - Which REVISIONS files were created (in `internal/changes/{component}/`)
   - Which layers had no impact (changes didn't affect them)
   - Which layers were skipped because an existing REVISIONS file already references this same CHANGES source
   - Any VS Code Extension impacts that need manual review
   - Recommended order for running `.claude/skills/dev-cycle/references/address-review.md` on each REVISIONS file

**STOP. Present the report and wait for the user to begin addressing each new revision file.**

## Constraints
- **CHANGES files persist.** Do not delete CHANGES files. They are the historical record.
- **Sub-agents write REVISIONS files to `internal/changes/{downstream-component}/`, not you.** Your output is the propagation report.
- **Internal-only changes stop here.** No downstream reviews needed.
- **Don't duplicate a review already in progress.** Skip a layer only if an existing REVISIONS file in that component's directory already has this CHANGES file as its source. Multiple REVISIONS files with different sources coexist — that is expected and correct.
