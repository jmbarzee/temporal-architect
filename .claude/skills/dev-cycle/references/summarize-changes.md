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

### skills
- alignment-design_REVISIONS_001.md: 3 groups, moderate severity
```

**Propagation status** — which CHANGES triggered downstream REVISIONS, and whether those were addressed:
```
## Propagation

parser/CHANGES_001.md (Schema) → visualizer/quality_REVISIONS_001.md → visualizer/CHANGES_001.md ✓
parser/CHANGES_001.md (Grammar) → skills/alignment-design_REVISIONS_001.md → pending
```

### Phase 4: Close-out list

The report's real product. Every item below must become a **GitHub issue** before the cycle's
`internal/changes/` files are deleted — they are working files, not an archive, and an
unexecuted propagation bullet left in a deleted file is debt that goes invisible.

Walk each `CHANGES_*.md` and collect:
- every bullet under **Downstream propagation** that was *not* executed this cycle
- every item under **Deferred**
- every open question or "owed" note in the body

Present them as a checklist with a proposed issue title and area label for each, so the
operator can approve the batch in one pass:

```
## To file as issues

- [ ] visualizer — render the new `signalSend` edge kind  (area:visualizer)
      from parser/CHANGES_001.md § Downstream propagation, not executed
- [ ] dsl — external-addressed signal sends  (area:dsl, blocked)
      from dsl/CHANGES_003.md § Deferred
```

State the count plainly: *"N items to file before cleanup."* If the list is empty, say so
explicitly — that is the signal the cycle is safe to close with nothing left behind.

### Phase 5: Write Summary (optional)

If requested, write a consolidated summary to `internal/changes/SUMMARY.md` suitable for use as a PR description.

The summary should include:
- One-paragraph overview of the cycle
- Bullet list of all changes by component
- Note any remaining work

## Constraints

- **Read-only by default.** Only write `internal/changes/SUMMARY.md` if explicitly requested or if running as part of the automated workflow.
- **Report what exists.** Don't evaluate quality or correctness of changes — just catalog them.
- **Follow the file conventions.** REVISIONS = pending, CHANGES = completed. Don't interpret them differently.
