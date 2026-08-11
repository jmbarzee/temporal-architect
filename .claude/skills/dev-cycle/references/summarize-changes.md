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

**Do not re-derive which propagations were executed.** `propagate-changes` Phase 4 already reports, per bullet, which REVISIONS file carried it and which bullets had no carrier (including back-edge bullets it declined to write). Take that report as the answer where you have it; walk the records yourself only to catch bullets from a component whose propagation step never ran.

**Skip any `## Design` preamble in a REVISIONS file.** It is agreed rationale, not owed work — harvesting it would file issues for decisions that were already made.

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

### Phase 5: Summary

**Required** whenever the cycle is running with `finish: return` — it is the caller's PR body and
there is no other channel for it. Optional otherwise.

Produce a consolidated summary suitable for use as a PR description. **Return it as
text — do not write it to a file.** A per-cycle status report committed to the repo is the archive
this project does not keep (`AGENTS.md` § Project Status); it belongs in the PR body, where it is
already versioned and discoverable.

The summary should include:
- One-paragraph overview of the cycle
- Bullet list of all changes by component
- Note any remaining work

## Constraints

- **Read-only.** This step writes no files. Its outputs are the Phase 4 close-out list and, optionally, the Phase 5 summary text.
- **Report what exists.** Don't evaluate quality or correctness of changes — just catalog them.
- **Follow the file conventions.** REVISIONS = pending, CHANGES = completed. Don't interpret them differently.
