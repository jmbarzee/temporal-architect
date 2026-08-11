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

A specific CHANGES file path must be provided (e.g., `internal/changes/parser/CHANGES_001.md`). If none is provided, scan `internal/changes/*/CHANGES_*.md` and propagate each un-propagated one in manifest wave order; if that scan is empty, report it and stop.

Read the specified file and extract **both** of these:

1. **`## Changes by Type`** — `Grammar`, `Schema`, `API`, `Semantic`, `Internal`, and the specific changes under each.
2. **`## Downstream propagation`** — the author's own bullets, each naming a component and the specific work owed. Keep every bullet's **exact text**; you will hand it on verbatim.

Both are mandatory sections of the CHANGES template. If `## Downstream propagation` is missing entirely — not `None`, but absent — treat that as a malformed record: report it and fall back to the routing table alone, because an omitted section is indistinguishable from an unwritten one.

If the file contains only `Internal` changes **and** the propagation section says `None`, report that and stop — nothing to fan out. Do **not** delete the CHANGES file.

### Phase 2: Build the Propagation Map

Rows are the **union** of two sources:

- **The routing table is a floor.** Every non-`Internal` change type contributes its routed component from the manifest's Propagation routing table. This catches an author who forgot a consumer.
- **The prose is authoritative beyond it.** Every component named in a `## Downstream propagation` bullet gets a row *even when the routing table has no matching edge*. Pick its review command from that component's row in the manifest's Components table (quality vs alignment, per what the bullet asks). If the ask fits neither, that is an escalation — not a dropped row.

**Why the union, and not the table alone.** This is the failure the seam exists to prevent. A real `dsl` CHANGES record named four downstream obligations — one for `parser`, one for `visualizer`, and two for `skills` (a design topic and an author-go reference file). The routing table gave `dsl | Grammar → parser` and nothing else. So `visualizer` and `skills` got no row, no sub-agent was ever dispatched for them, and three of the four asks were silently lost — including a construct that then rendered as nothing in the visualizer for months. Enriching a sub-agent's context cannot rescue a component that never got a sub-agent.

| Component | Row source | Review command | Brief |
|---|---|---|---|
| `parser` | table + prose | `review-alignment-parser` | the parser bullet, verbatim |
| `skills` | **prose only** | `review-alignment-author-skills` | the author-go bullet, verbatim |

Deduplicate by **component**, not by change type: one sub-agent per downstream component, carrying every bullet and change type relevant to it.

**Back-edge guard.** A bullet may name the component being propagated, or one upstream of it. Do **not** write a REVISIONS file into a same-or-upstream component — that would cycle the dependency DAG and can race the wave-safety invariant the loop relies on. Instead, record it in Phase 4 as an unexecuted propagation so the cycle's close-out files it as an issue. The DAG stays acyclic and the ask still survives.

### Phase 3: Fan Out

For each downstream layer in the propagation map, check whether an existing REVISIONS file already covers this propagation:

- Read any existing `*_REVISIONS_*.md` files in `internal/changes/{downstream-component}/`.
- If an existing file's **Source** field references the same CHANGES file being propagated, skip that layer — the impact is already tracked.
- Otherwise, launch a sub-agent regardless of how many REVISIONS files already exist. REVISIONS files are numbered for a reason; a pre-existing file from a different source is unrelated pending work, not a duplicate.

Each sub-agent:
1. Runs the specified review command.
2. Receives, as its **primary brief, the bullet(s) naming its own component — copied verbatim.** Not summarized, not paraphrased, not condensed to a change type.
3. Receives the relevant change-type list as *secondary* context.
4. Follows the review command's full workflow — Explore → Catalog → Group → Write REVISIONS file to `internal/changes/{downstream-component}/` using the sequence number the main agent allocated.

**Copy the bullet; do not summarize it.** The whole seam rests on this. A bullet like *"new `reference/signal-send.md` mapping the statement form to `ChildWorkflowFuture.SignalChildWorkflow` (the SDK returns a future; the DSL statement maps to the fire-and-forget call)"* survives only if compression is forbidden. Reduced to "update the author-go skill," it is indistinguishable from a generic sweep and the specific work goes undone.

Give each sub-agent **only** the bullets for its own component. The visualizer agent reading the skills bullet is noise competing with its brief.

**Escape hatch — a crude REVISIONS beats a lost ask.** If a named component is outside this cycle's scope, or a full review would plainly be wasted effort for a one-line ask, write a single-group REVISIONS file yourself carrying the bullet verbatim under `## Group 1` instead of dispatching a review. Note in Phase 4 that you did so. The review is what grounds an ask in downstream code, so prefer dispatching; but never drop the ask to avoid the cost.

Sub-agents run in parallel where the downstream layers are independent. **Await them all** — Phase 4 reports their results, and the dev-cycle loop awaits this step before advancing a wave.

### Phase 4: Report coverage, both directions

When all sub-agents complete, report:

**Per bullet — which carrier took it.** Every bullet in `## Downstream propagation` must appear here with its outcome:

| Bullet (component) | Carried by | Outcome |
|---|---|---|
| `skills` — author-go signal-send reference | `skills/alignment-author_REVISIONS_002.md` | dispatched |
| `visualizer` — render the `signalSend` edge | *crude REVISIONS* `visualizer/parser-output_REVISIONS_003.md` | bullet copied verbatim |
| `parser` — (names an upstream component) | — | **unexecuted — back-edge, file as issue** |

**A bullet with no carrier is an unexecuted propagation.** Name it explicitly under that heading. This report is the direct input to `summarize-changes` Phase 4, which turns unexecuted propagations into GitHub issues before the cycle deletes its records — so a bullet you silently omit here becomes debt that no longer exists anywhere.

**Per routing-table row — whether a bullet backed it.** A component the table routed to but no bullet mentioned still gets dispatched (the table is the floor). Flag it as *routed, unmentioned* — it usually means the CHANGES author under-described the impact, which is worth knowing even though it is not a blocker.

Also report: REVISIONS files created and where; layers skipped because an existing file already has this same `**Source:**`; and the recommended `address-review.md` order.

**Return the report.** Do not begin addressing the new REVISIONS files — the dev-cycle loop picks them up on its next scan, in manifest wave order.

## Constraints
- **Do not delete the CHANGES file you are propagating.** It is this cycle's working record and the loop still needs it. It is *not* an archive: the cycle's Finalize gate deletes `internal/changes/` outright once every open item in it has become a GitHub issue.
- **Sub-agents write REVISIONS files to `internal/changes/{downstream-component}/`, not you.** Your output is the propagation report.
- **Internal-only changes stop here** — but only when `## Downstream propagation` also says `None`. A bullet outranks the change type.
- **Never drop a bullet.** Every bullet leaves this step either carried by a REVISIONS file or named as an unexecuted propagation. There is no third outcome.
- **Copy, don't summarize.** A bullet handed to a sub-agent goes verbatim. Compression is how the specific ask degrades into a generic sweep.
- **Don't duplicate a review already in progress.** Skip a layer only if an existing REVISIONS file in that component's directory already has this CHANGES file as its source. Multiple REVISIONS files with different sources coexist — that is expected and correct.
