# Execute a Review's Groups

Execute the groups produced by a review command. This command owns the inner loop: plan → execute → validate → document → repeat.

Invoke this after any review command has produced a grouped finding plan.

## Input

**Option 1 (default; required under the dev-cycle loop): Explicit REVISIONS file paths.** Specific REVISIONS files are provided (e.g., `internal/changes/parser/quality_REVISIONS_001.md`, `internal/changes/parser/alignment_REVISIONS_001.md`). Read those files and merge their grouped plans into one execution sequence. When dispatched as a subagent by the dev-cycle loop, this is the only valid input — work entirely from the named files, never from conversation context.

**Option 2 (manual, interactive use only): Conversation context.** Only when a human is driving this command directly and the grouped plan is already in the conversation. If no plan and no file path is available, that is a bad invocation — say so and stop. Do not guess at scope. Subagents must not use this path.

Each group in the plan should have:
- A theme name
- A list of findings with locations
- An estimated scope (which files are touched)

## Workflow

Repeat the following loop for each group, in order. Do not skip ahead.

### For Each Group:

**Step 1: Plan**

Before touching any code, write a concrete execution plan for this group:
- List every file that will change and why
- Identify which changes are independent (can be done in parallel by sub-agents)
- Identify which changes are sequential (must be ordered)
- Flag any finding in this group where the right approach is ambiguous

State the plan, then carry it out. A finding whose approach is genuinely ambiguous — two valid designs with different consequences — is the one case to escalate rather than decide; see Constraints.

**Step 2: Execute**

Carry out the plan. Where changes are independent, spawn parallel sub-agents — one per file or logical unit. Each sub-agent receives:
- The specific finding(s) it is addressing
- The file(s) it owns
- A constraint to make no changes outside its assigned scope

**Step 3: Validate**

Run the check for the layer that was changed. **The commands live in one place: `.claude/skills/dev-cycle/SKILL.md` § Validation Contract.** Read them from there rather than from memory — several carry a required environment prefix, and a restated copy here would drift out of sync and fail silently in the sandbox.

If validation fails, fix before moving on. Do not paper over failures.

**Step 4: Summarize**

Present a brief summary:
- What changed (files + nature of change)
- Validation result
- Any new findings surfaced during execution that weren't in the original plan

**Step 5: Document**

Update the REVISIONS file(s) being processed:
- Mark this group as completed
- Add any new findings surfaced during execution as new tracked items

**Step 6: Next group**

Proceed to the next group. Work the sequence to the end — do not stop to ask between groups.

If a hard blocker forces an early stop, name the groups that remain and carry them into `## Deferred` in the CHANGES record. A REVISIONS file is not a durable record of remaining work: Step C deletes it.

---

## After the Last Group

When all groups are complete (or the user decides to close the cycle), perform this sequence:

**Step A: Final review**

Present a consolidated summary of all changes made across all groups. **Wait for user approval.**

**Step B: Write CHANGES file**

Determine the component from the REVISIONS file path (e.g., `internal/changes/parser/quality_REVISIONS_001.md` → component is `parser`).

Write `internal/changes/{component}/CHANGES_{NNN}.md` using the next available sequence number:

```
# {Component} Changes

**Source review(s):** [list review commands that produced the consumed REVISIONS files]
**REVISIONS file(s):** [list consumed REVISIONS files]

## Summary
[1-2 sentences on what changed overall]

## Changes by Type

### Grammar
[DSL syntax changes — list each with file:location]

### Schema
[JSON output shape changes — list each with field path]

### API
[Go type or interface changes — list each with type name]

### Semantic
[Behavior changes with no signature change — list each with description]

### Internal
[Refactors with no downstream contract impact — list each briefly]

## Downstream propagation
[Every consumer this change obligates, per the manifest's propagation routing —
 one bullet each, naming the component and the specific work owed.
 Write `None — leaf change.` if there genuinely is none.]

## Deferred
[Everything in scope that this cycle did NOT do: spillover groups, known
 limitations shipped on purpose, open questions raised and not settled.
 Write `None.` if there genuinely is none.]
```

Within **Changes by Type**, only include sub-sections where changes occurred; empty ones are omitted.

**`## Downstream propagation` and `## Deferred` are mandatory** — write `None` rather than omitting them. The cycle's close-out gate turns exactly these two sections into GitHub issues before the record is deleted, and it cannot tell an omitted section from an empty one. An omitted section reads as "nothing owed" and is how propagation debt goes invisible.

**Step C: Delete consumed REVISIONS files**

Delete all `*_REVISIONS_*.md` files that were processed. The CHANGES file is now the record of this cycle.

Anything left unfinished must appear under `## Deferred` above — a REVISIONS file is never the record of remaining work once it is deleted.

## Constraints

- **One group at a time.** Do not start group N+1 until group N is validated and documented.
- **Surgical changes only.** If execution reveals a larger problem, add it as a new finding — don't expand the current group's scope.
- **Sub-agents execute, don't decide.** Genuine ambiguity — two valid designs with different consequences — gets escalated to **the dispatching agent** (the main agent under the dev-cycle loop; the user when a human is driving this directly). It is never resolved silently by a sub-agent, and never resolved by picking the first option that compiles.
- **Validation is not optional.** A group is not done until the build passes.
