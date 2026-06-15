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

**Always read `internal/harness/components.md` first.** It is the single source of truth for
the component graph: source scopes, coordination dirs, review mappings, propagation routing,
and wave ordering. Do not restate the graph from memory.

## Two entrypoints

- **dev** — run the full loop (default; see The Loop).
- **review** — run a single review for one component without the loop (see Review Entrypoint).

## The Loop (dev entrypoint)

Transcribed from `DevCycleWorkflow` in `internal/orchestrator/dev-cycle.twf`. Pass 1 is
serial: dispatch one step-subagent at a time.

**Phase 0 — Scope (gate 1).** Ask the user:
1. Starting point: *fresh* (review from scratch), *resume* (use existing REVISIONS/CHANGES in `internal/changes/`), or *targeted* (specific components).
2. Which layers to review this cycle (from the component list in the manifest).

Present the proposed scope and **wait for confirmation**.

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

**Finalize (gate 2).** Dispatch a **summarize-changes** subagent, present the consolidated
summary, and **wait for approval** before any PR creation or `internal/changes/` cleanup.

## Autonomy policy

Two human gates only: **scope confirmation** (start) and **final review** (end). Between them,
auto-proceed across groups, components, and propagation — bounded by Limits.

The step prompts under `references/` were written for manual use and contain their own
"STOP / wait for approval" points. When running the loop, the main agent owns the two gates
above; instruct each dispatched subagent to run its workflow to completion and return results
rather than stopping at those internal approval points. Subagents execute; they escalate
genuine ambiguity back to the main agent, and never resolve it silently.

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

The `GOMODCACHE` prefix is required in this sandbox (see `AGENTS.md`).

## File-driven dispatch

Every subagent dispatch must be self-contained: pass the explicit REVISIONS/CHANGES file
paths and name the `references/` prompt to follow. Never rely on shared conversation context —
subagents don't have it.

The **main agent allocates** the next `_{NNN}` sequence number when instructing a subagent to
write a REVISIONS or CHANGES file, so concurrent or repeated writes to the same component
directory never collide. (Source-encoded names and worktree isolation come in Pass 2.)

## Step index (`references/`)

Dispatch the matching prompt on demand; do not read them all up front.

| Prompt | Use |
|---|---|
| `review-quality-dsl-spec.md` | DSL spec coverage/representation against Temporal primitives |
| `review-quality-parser.md` | Go parser / AST / resolver code quality |
| `review-quality-visualizer.md` | Visualizer TypeScript quality + contract consumption |
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
