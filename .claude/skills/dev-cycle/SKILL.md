---
name: dev-cycle
description: Run THIS repo's automated dev-cycle harness — discover (reviews) then execute (address-review), propagate downstream, and summarize — driving the REVISIONS/CHANGES coordination files under internal/changes/. Use when running, resuming, or scoping a dev cycle on the temporal-architect repo, or when running a single-layer review. Not for end-user Temporal design work.
---

# Dev-Cycle Harness

The main agent runs one loop; subagents run the individual steps. This is the agent-loop
runtime of the dev cycle; `internal/orchestrator/dev-cycle.twf` is its durable Temporal twin.

The filesystem is the source of truth: `*_REVISIONS_*.md` = pending work, `CHANGES_*.md` =
completed work, both under `internal/changes/{component}/`. A crashed or resumed session
recovers by re-scanning — there is no hidden state.

**Both file types are scoped to one cycle and are deleted when it closes.** They are working
files for the loop below, not an archive: git history holds what changed, `CHANGELOG.md` holds
what shipped, and **GitHub issues hold everything still to do**. Anything unfinished at close
becomes an issue — never a file left behind. The repo does not track its own backlog.

**Always read `internal/harness/components.md` first.** It is the single source of truth for
the component graph: source scopes, coordination dirs, review mappings, propagation routing,
and wave ordering. Do not restate the graph from memory.

## Two entrypoints

- **dev** — run the full loop (default; see The Loop).
- **review** — run a single review for one component without the loop (see Review Entrypoint).

## Invocation

Both human gates are **parameters**, so this skill can run interactively or as a subroutine of
another skill. Arguments arrive as free text: recognize these keys wherever they appear, and
ignore surrounding prose.

| Key | Values | Default |
|---|---|---|
| `scope-gate` | `ask` \| `given` | `ask` |
| `close-gate` | `ask` \| `auto` | `ask` |
| `finish` | `pr` \| `return` | `pr` |
| `start` | `fresh` \| `resume` \| `targeted` | asked |
| `components` | comma list of component names | — |
| `revisions` | explicit REVISIONS file paths | — |

One preset, so a caller passes a single token — `mode=subroutine` (also accept `subroutine` or
`autonomous`) means `scope-gate: given`, `close-gate: auto`, `finish: return`.

**`mode=subroutine` requires `components` or `revisions`.** If neither is present, stop
immediately with `outcome: bad_invocation` — write no files, run no reviews, dispatch nothing. A
subroutine run has no human to fall back to asking, so guessing at scope is the one failure that
cannot be recovered from later.

With no arguments at all, behaviour is exactly as it has always been: both gates, and a PR at
the end.

## The Loop (dev entrypoint)

Transcribed from `DevCycleWorkflow` in `internal/orchestrator/dev-cycle.twf`. Pass 1 is
serial: dispatch one step-subagent at a time.

**Phase 0 — Scope (gate 1).**

When `scope-gate: ask` (default), ask the user:
1. Starting point: *fresh* (review from scratch), *resume* (use existing REVISIONS/CHANGES in `internal/changes/`), or *targeted* (specific components).
2. Which layers to review this cycle (from the component list in the manifest).

Present the proposed scope and **wait for confirmation**.

When `scope-gate: given`, derive the scope from `start` / `components` / `revisions` and proceed
without asking. **State the derived scope as the first line of output** — it is the scope of
record, and a caller that passed something ambiguous needs to see what you concluded. If it
cannot be derived, stop with `outcome: bad_invocation` rather than falling back to a default.

**Phase 1 — Initial reviews** (only when a fresh/targeted scope is requested). Dispatch a
review subagent per chosen layer (per the manifest's quality/alignment mappings). Each runs
its review prompt to completion and writes a REVISIONS file into `internal/changes/{component}/`.

**Phase 2 — Loop.** Repeat:
1. Scan `internal/changes/` for `*_REVISIONS_*.md`; group by component.
2. If none pending → go to Finalize (outcome: `completed`).
3. If a limit is hit → stop (outcome: `wave_limit_reached`); report the deferred REVISIONS.
4. Pick the next component in manifest wave order (upstream before downstream).
5. Dispatch an **address-review** subagent (`references/address-review.md`) with the explicit REVISIONS file paths. It edits source, writes `CHANGES_{NNN}.md`, and deletes the consumed REVISIONS files.
6. **Validate** (see Validation Contract). On failure, re-dispatch to fix; the component is not done until validation passes.
7. Dispatch a **propagate-changes** subagent (`references/propagate-changes.md`) with the CHANGES file. It writes downstream REVISIONS per the manifest's propagation routing.
8. Re-scan and continue.

**Finalize (gate 2).** Dispatch a **summarize-changes** subagent and present the consolidated
summary. When `close-gate: ask` (default), **wait for approval**; when `close-gate: auto`,
proceed straight into close-out. Either way close-out is the same three steps:

1. File a GitHub issue for every deferral, unpropagated downstream item, and open question the
   cycle produced — each CHANGES record's "Deferred" and "Downstream propagation" sections are
   the checklist, and `propagate-changes`' own coverage report already names which bullets went
   uncarried. Keep the issue numbers; they go in the result.
2. Delete `internal/changes/` outright. Sweep the **whole directory**, not a name pattern —
   scratch files that don't match `*_REVISIONS_*.md` / `CHANGES_*.md` (reflection notes,
   summaries) would otherwise survive and become the archive this project does not keep.
3. Then branch on `finish`:
   - **`pr`** (default) — create the PR.
   - **`return`** — do **not** commit, push, or open a PR. Leave the working tree as it is and
     emit the result block below. The caller owns the git tail.

Step 1 gates step 2: do not delete a record until its open items exist as issues. A propagation
bullet that was never executed is exactly the kind of debt that goes invisible otherwise.

**Step 1 stays here even under `finish: return`.** It is tempting to let the caller file the
issues, but deletion happens inside this skill — so a caller filing them afterwards would be
filing *after* the records were already gone. The gate's whole integrity is that deletion cannot
outrun filing, and that only holds while both live in the same step.

### Result

Emit this as the final message, always. Under `finish: return` it is the caller's only channel;
under `finish: pr` it is still the honest summary of what happened.

```
## Cycle result
outcome: completed | wave_limit_reached | bad_invocation
gates: scope=given close=auto finish=return
components: parser, sampler
validation: parser ok, sampler ok
issues filed: #71, #72
undrained revisions: none
```

Then, when `finish: return`, a `## PR body` section containing the `summarize-changes` Phase 5
summary verbatim — ready to paste. **Nothing is written to a file.** A per-cycle status report
committed to the repo is precisely the archive this project does not keep.

## Autonomy policy

Two human gates, **both parameterized**: **scope confirmation** (start, `scope-gate`) and
**final review** (end, `close-gate`). Between them, auto-proceed across groups, components, and
propagation — bounded by Limits.

**Under `close-gate: auto` there are zero human gates**, and the Limits table below becomes the
only backstop against a runaway loop. A caller running unattended should lower max rounds rather
than rely on someone noticing.

The step prompts under `references/` run to completion on their own — they hold no approval
pauses, so there is nothing for the loop to override. The two gates above live here, in the main
agent, and nowhere else.

Subagents execute; they escalate genuine ambiguity — two valid designs with different
consequences — back to the dispatching agent, and never resolve it silently. Escalation is the
only reason a step returns early.

One real gate does survive inside a step: `address-review.md` Step A presents a consolidated
summary before it writes the CHANGES record and deletes the consumed REVISIONS files. That is
the last point before durable mutation, which is why it is the one kept. It follows
`close-gate` — dispatch it with the resolved value, and under `auto` it presents and proceeds.

## Limits

| Limit | Default | Purpose |
|---|---|---|
| Max rounds (Phase 2 iterations) | 4 | Prevent infinite propagation loops |
| Max components processed total | 15 | Bound total compute |
| Per-subagent runtime | advisory | If a step stalls, stop and report |

Configurable; raise deliberately. On a limit hit, stop and report which REVISIONS remain
(deferred, not finished) — distinguish `completed` (drained) from `wave_limit_reached`.

## Validation Contract

Before recording a component done (keeping its CHANGES rather than reverting), run the check
for that component's layer. A component is **not done** until its validation passes — do not
paper over failures.

| Layer (components) | Validation |
|---|---|
| Go — `parser` (`tools/lsp/`) | `GOMODCACHE=$HOME/go/pkg/mod go build ./... && go test ./...` from `tools/lsp/` |
| Skills / spec — `dsl`, `skills` | `twf check` against affected `.twf` files (e.g. under `examples/`) |
| Visualizer — `visualizer`, `visualizer-spec` | `npm run build` from `tools/visualizer/` |
| Go — `sampler` (`tools/sampler/`) | `GOMODCACHE=$HOME/go/pkg/mod go build ./... && go test ./...` from `tools/sampler/` (its own module) |

The `GOMODCACHE` prefix is required in this sandbox (see `AGENTS.md`).

## File-driven dispatch

Every subagent dispatch must be self-contained: pass the explicit REVISIONS/CHANGES file
paths and name the `references/` prompt to follow. Never rely on shared conversation context —
subagents don't have it.

The **main agent allocates** the next `_{NNN}` sequence number when instructing a subagent to
write a REVISIONS or CHANGES file, so concurrent or repeated writes to the same component
directory never collide. (Source-encoded names and worktree isolation come in Pass 2.)

## REVISIONS file contract

The invariants every REVISIONS file must satisfy, wherever it came from. Each review prompt owns
its own field labels and wording — **this is not a template**, and the variation between prompts is
deliberate. Only what another step reads is fixed here.

- **Path** — `internal/changes/{component}/{type}_REVISIONS_{NNN}.md`. The `{type}` token is
  source-encoded so concurrent reviews of one component don't collide (see the manifest).
- **`**Source:**`** — a bold-label line immediately after the H1. **Required.** `propagate-changes`
  dedups on it: a downstream layer is skipped when an existing file in that directory already
  carries the same Source. Four legal forms, compared as **strings**, not paths:
  | Form | Written by |
  |---|---|
  | `internal/changes/{component}/CHANGES_{NNN}.md` | a propagation |
  | `—` | a fresh review with no upstream trigger |
  | `issue #N` | work picked up from a GitHub issue |
  | `reflect-skill` | a skill reflection |
- **`## Design`** — *optional.* Agreed rationale, rejected alternatives, and constraints that must
  hold. It carries **no work items**: `address-review` reads it for context and executes only the
  groups. Present when a human settled the approach before dispatch; absent in review-generated
  files.
- **`## Summary`** — what this file covers.
- **`## Group N: Title`** — one or more. The unit `address-review` executes, in order. Each group
  states what it addresses, which files it touches, its change type, and its parallelism — in
  whatever labels its originating prompt prefers.

A group's `**Change type:**` is routinely compound (`` `Grammar` + `API` ``) and is read by humans
only; `propagate-changes` takes change types from the CHANGES record, not from here.

## Step index (`references/`)

Dispatch the matching prompt on demand; do not read them all up front.

| Prompt | Use |
|---|---|
| `review-quality-dsl-spec.md` | DSL spec coverage/representation against Temporal primitives |
| `review-quality-parser.md` | Go parser / AST / resolver code quality |
| `review-quality-visualizer.md` | Visualizer TypeScript quality + contract consumption |
| `review-quality-sampler.md` | Sampler Go quality + observed-graph contract population |
| `review-quality-visualizer-spec.md` | Visualizer product/UX against its spec |
| `review-quality-skill.md` | Single skill craft/focus/density (design, author-go, author-infra) |
| `review-alignment-parser.md` | Parser implementation vs `tools/spec/sections/` |
| `review-alignment-parser-visualizer.md` | Parser JSON contract vs visualizer TS types |
| `review-alignment-visualizer.md` | Visualizer implementation vs its spec |
| `review-alignment-design-skill.md` | Design skill vs parser (constructs, errors, AST) |
| `review-alignment-author-skills.md` | Author-go / author-infra skills vs design skill + Temporal SDK |
| `address-review.md` | Execute a component's REVISIONS groups; write CHANGES |
| `propagate-changes.md` | Fan out downstream REVISIONS from a CHANGES file |
| `summarize-changes.md` | Consolidate the cycle into a report |

## Review Entrypoint

To run a single review without the loop: read `internal/harness/components.md` for the
component's scope and review mapping, dispatch that one review subagent (it writes a REVISIONS
file into `internal/changes/{component}/`), and stop. Run `address-review.md` later to execute it.
