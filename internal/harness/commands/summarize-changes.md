# Summarize Changes

Scan the `internal/changes/` directory tree and produce a consolidated report of all work done across the development cycle.

## Workflow

### Phase 1: Scan

Read the `internal/changes/` directory structure. For each component subdirectory, collect:
- All `CHANGES_*.md` files (completed work)
- All `*_REVISIONS_*.md` files (pending work)

### Phase 2: Extract

For each `CHANGES_*.md` file, extract:
- Component name (from directory)
- Source review command(s)
- Change types (Grammar, Schema, API, Semantic, Internal)
- Summary of what changed
- Files modified

For each remaining `*_REVISIONS_*.md` file, extract:
- Component name
- Review type (quality, alignment, parser-output, etc.)
- Number of groups / findings

### Phase 3: Present

Present a consolidated report:

**Completed work** — by component, what changed, which rounds, change types:
```
## Completed

### parser (2 rounds)
- CHANGES_001.md: [summary] (Schema, Internal)
- CHANGES_002.md: [summary] (API)

### visualizer (1 round)
- CHANGES_001.md: [summary] (Internal)
```

**Remaining work** — components with unprocessed REVISIONS:
```
## Remaining

### design-skill
- alignment_REVISIONS_001.md: 3 groups, moderate severity
```

**Propagation status** — which CHANGES triggered downstream REVISIONS, and whether those were addressed:
```
## Propagation

parser/CHANGES_001.md (Schema) → visualizer/quality_REVISIONS_001.md → visualizer/CHANGES_001.md ✓
parser/CHANGES_001.md (Grammar) → design-skill/alignment_REVISIONS_001.md → pending
```

### Phase 4: Write Summary (optional)

If requested, write a consolidated summary to `internal/changes/SUMMARY.md` suitable for use as a PR description.

The summary should include:
- One-paragraph overview of the cycle
- Bullet list of all changes by component
- Note any remaining work

## Constraints

- **Read-only by default.** Only write `internal/changes/SUMMARY.md` if explicitly requested or if running as part of the automated workflow.
- **Report what exists.** Don't evaluate quality or correctness of changes — just catalog them.
- **Follow the file conventions.** REVISIONS = pending, CHANGES = completed. Don't interpret them differently.
