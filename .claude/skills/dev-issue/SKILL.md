---
name: dev-issue
description: Take a single GitHub issue from THIS repo through to a pull request — triage and route it, settle its design with the user, then run the /dev-cycle harness autonomously and land the result. Use when picking up a specific issue by number. Not for running a broad review sweep (that is /dev-cycle) and not for end-user Temporal design work.
---

# Take an Issue to a Pull Request

Wraps `/dev-cycle` with the two things it deliberately does not do: decide *what* to build, and land the result. The issue supplies the problem, a conversation with the user settles the approach, `/dev-cycle` does the work, and this skill opens the PR.

This is a router and a git tail, not an implementer. Every edit to source is made by `/dev-cycle`'s own steps — if this skill finds itself writing code, the work has escaped its scope and belongs in a REVISIONS group instead.

## Input

One issue number. One issue per run: the PR maps 1:1 to the issue it closes, and `/dev-cycle` already batches internally across components.

## Workflow

### Phase 0: Triage and route

Read it: `gh issue view <n> --json number,title,body,labels,comments`.

**Decline before doing any work** when a signal below fires. Declining is a finding, not a failure — name the signal, say what would unblock it, and stop.

| Signal | Why it cannot proceed |
|---|---|
| `epic` | Spans components and cycles. Offer to split it into issues instead. |
| `blocked` | Name the blocking issue. Working around a declared blocker produces a design the blocker will invalidate. |
| The body places the work in the distribution repo | Wrong repository — `jmbarzee/temporal-architect-dist` owns every end-user consumption model. A label cannot be trusted here; the body is the evidence. |
| `area:orchestrator` | `internal/harness/components.md` excludes `internal/orchestrator/` from the component graph by design, so there is no component to route to and no validation to run. Handle by hand. |
| A design question with no implementable outcome | Some issues exist to *settle* something. The discussion is still worth having, but its product is an issue update, not a diff. Say so rather than manufacturing work. |

**Route by the files the work will touch — not by the label.** Labels are a hint that lies in both directions:

- `area:cli` and `area:decompose` both land under `tools/lsp/`, so both are the **`parser`** component.
- `area:decompose` sometimes means "about the decomposition feature" rather than "in `parser/decompose/`" — several such issues are pure visualizer overlay work.
- A single area label routinely hides cross-component work. An issue that changes a type under `tools/lsp/parser/observe/` is a `parser` **Schema** change that fans out to every consumer, however it is labelled.
- No label maps to `tools/visualizer/spec/`, so a `visualizer-spec` pickup is invisible to label routing. Read the body for spec references.
- Migrated issues carry a `<!--PROVENANCE-->` footer naming the coordination directory they came from. That is a stronger signal than the label — but two of those directories are workstreams, not components (see the routing table in `internal/harness/components.md`).

Read the files the issue names before proposing a component set. Propose it; Phase 2 confirms it.

### Phase 1: Worktree

Fetch `main`, then create a worktree so the cycle cannot disturb the user's working tree:

```
git worktree add -b <component>/<n>-<slug> .claude/worktrees/dev-issue-<n> origin/main
```

`<slug>` is a few words from the title, kebab-cased. Everything from here runs in that worktree. It is removed in Phase 5 once the PR exists.

### Phase 2: Settle the design *(the human gate)*

The one conversation in this skill. It is open-ended — do not work through a script of questions, and do not fire them all at once. Bring four lenses to the issue and the code it names, and follow the ones that have something to say.

**Scope.** What is in, what is out, and is this one cycle's work? Where does the issue's ask stop and the next issue begin? An issue that grows past its component set during discussion is a *split*, not a bigger cycle — say so rather than absorbing the growth.

**Blast radius.** Which components does this actually touch, and what contract type is each change? A `Grammar` change to the spec obligates the parser; a `Schema` change to the wire contract obligates every consumer of it. This is where the Phase 0 routing gets confirmed or corrected, and it determines how many REVISIONS files Phase 3 writes.

**Open questions.** Issues labelled `needs-design` carry verbatim `**Open questions:**` blocks in their bodies — that is the agenda, already written by whoever deferred the work. Walk it. Each question ends the discussion either **settled** or **explicitly deferred with a reason**; a question that is merely unmentioned will be re-derived by the implementer, which is the whole failure this gate exists to prevent.

**Prior art.** What already exists that this should reuse or align with? The repo is dense with near-misses — a strategy enum that wants one more value, a review prompt that wants one more lens, a façade that already re-exports the type. Reaching for a new mechanism when an existing one bends is the most common way this codebase grows weight.

**The discussion is done when** every open question is settled or deferred-with-reason, the component set is fixed, and each component's change type is known. Not when you run out of questions.

**STOP. Present the settled design and the proposed work breakdown. Wait for confirmation before writing anything.**

### Phase 3: Write REVISIONS

One file per affected component, at `internal/changes/{component}/issue-{n}_REVISIONS_{NNN}.md`. The `issue-{n}` prefix is the source-encoded `{type}` token, so two issues worked in sequence never collide in one component directory. Use `_001` and increment past anything already there. It must satisfy `.claude/skills/dev-cycle/SKILL.md` § REVISIONS file contract:

```
# {Component} Revisions: {short title}

**Source:** issue #{n}

## Design
{The rationale settled in Phase 2 — why this approach, which alternatives were
 rejected and why, and any constraint that must hold. No work items: this section
 exists so the implementer does not re-derive a decision the user already made.}

## Summary
{1-2 sentences on what this file covers}

## Group N: {Theme}

**Findings:** {what this group addresses}
**Files touched:** {paths}
**Change type:** `{Grammar | Schema | API | Semantic | Internal}`
**Parallelism:** {what can run alongside what}
```

`**Source:** issue #{n}` is one of the four legal Source forms and `propagate-changes` dedups on that exact string — a different spelling reads as a different trigger and the layer gets reviewed twice.

Groups go in execution order. `/dev-cycle` works them top to bottom and does not reorder.

### Phase 4: Run the cycle

Invoke `/dev-cycle` with `mode=subroutine` and the explicit paths written in Phase 3:

```
mode=subroutine revisions=internal/changes/parser/issue-32_REVISIONS_001.md
```

Passing neither `revisions` nor `components` is a hard `bad_invocation` — the harness will refuse rather than guess at scope.

Under this mode `/dev-cycle` does **not** commit, push, or open a PR; that is Phase 5's job. It *does* file GitHub issues for every deferral and unexecuted propagation, and it *does* delete `internal/changes/` outright. **Do not duplicate either.** The issue filing in particular cannot move here: deletion happens inside the harness, so anything filed afterwards would be filed after the records were already gone.

It returns a `## Cycle result` block and, under this mode, a `## PR body`. Both are text — nothing is written to disk.

### Phase 5: Land, or pause

**On `outcome: completed` with every component's validation green:** commit, push, open the PR, comment on the issue with the PR link, close the issue if the work resolves it, then `git worktree remove` the worktree.

The PR body is the harness's returned `## PR body` **plus the design rationale from Phase 2**. That rationale exists nowhere else — `internal/changes/` is gitignored and the harness has already deleted it, so a PR that omits it loses the reasoning permanently.

**On anything else** — `wave_limit_reached`, a failed validation, undrained REVISIONS — stop and surface it. Report what drained, what validated, which issues the harness already filed, and where the worktree is. Then wait. The user adjusts and the cycle resumes; nothing is pushed and nothing is discarded on this skill's own judgement, because a partial cycle is a decision about scope and scope belongs to the user.

## Constraints

- **Never implement.** Every source edit belongs to a `/dev-cycle` step. If a fix looks small enough to just do, it is small enough to be a Group — and doing it here skips the validation contract that would have caught it being wrong.
- **Decline loudly.** An issue that trips a Phase 0 signal gets a named reason and a suggested next step. Silently reshaping an epic into something implementable produces a PR that answers a question nobody asked.
- **The label is a hint, the files are the truth.** Route on what the work touches. A wrong component means the wrong review prompt, the wrong validation command, and a propagation that fans out from the wrong node.
- **One human gate, plus failure.** Phase 2 always stops. Phase 5 stops only when the cycle did not drain cleanly. Everything between them runs unattended — that is the point of the harness being callable.
- **Settle or defer, never skip.** An open question left unmentioned in `## Design` gets re-decided by the implementer, usually differently, and the disagreement surfaces as rework.
- **The PR body is the only durable record.** Scratch is deleted, issues are closed, branches are merged. Anything a future reader needs to understand *why* has to be in the body.
- **Do not batch issues.** One issue, one branch, one PR. A PR closing three issues cannot be reverted for one of them.
