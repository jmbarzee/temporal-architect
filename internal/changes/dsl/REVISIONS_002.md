# DSL Revisions: Handler Options Framework

**Source:** ad-hoc design review of signal/query/update completeness (June 2026), follow-up to `REVISIONS_001`.
**Reflection file:** none — initiated directly from the user during the cross-workflow-messaging design discussion. The first member of this framework (`unfinished_policy`) was the surfaced gap; the framework itself is the bundling answer.

## Summary

Signal, query, and update handler declarations currently have no options surface. Today the grammar is `signal Name(params): NEWLINE INDENT body DEDENT` — no slot for per-handler configuration. This REVISIONS adds an `options:` sub-block to handler declarations using the existing `options_block` grammar from `06-statement-syntax.md`, and admits one initial key: `unfinished_policy`. Setting up the slot now lets future per-handler options (description, validator references, etc.) land as additive key additions instead of grammar changes.

`unfinished_policy` was the immediate motivation. Temporal exposes `HandlerUnfinishedPolicy` (`Abandon` / `WarnAndAbandon`) on signal and update handlers — it's a design intent statement, not just a runtime knob. "Is it OK for this handler to be silently abandoned when the workflow exits mid-handler?" is a real architectural question, especially for update handlers whose callers are waiting on results.

This REVISIONS is structurally independent of `REVISIONS_001` — they touch different parts of the grammar and can ship in either order.

## Design decisions locked in

| # | Decision | Rationale |
|---|---|---|
| D1 | Reuse the existing `options:` block grammar | The `options_block` / `option_entry` productions in `06-statement-syntax.md` already cover the surface needed (key-value pairs with optional nested blocks). Reusing them gives `options:` on handler declarations the same lexer, parser, and validator path as call-site options blocks. No new syntactic shape; no new error surface. |
| D2 | `options:` is optional on every handler declaration | Backwards-compatible additive change. Every existing `signal Name(params):` continues to parse. |
| D3 | First admitted key is `unfinished_policy: abandon \| warn_and_abandon` | Direct mapping to Temporal's `HandlerUnfinishedPolicy`. Values are the SDK enum lowercased. Default (when key omitted) is `warn_and_abandon`, matching the SDK default. |
| D4 | Query handlers also gain an `options:` slot | Even though `unfinished_policy` doesn't apply to queries (queries are synchronous and can't be "unfinished"), keeping the grammar uniform across all three handler kinds avoids a special case. Initial allowed-key set for queries is empty; the slot is reserved for future keys like `description`. |

---

## Group 1: Grammar extension — handler `options:` sub-block

**Findings:**

- The handler declaration grammar in `01-workflows.md` is fixed-shape: name, params, body. No slot exists for per-handler configuration. Adding one later as a grammar change would force every existing handler declaration to be reparsed against new productions. Adding it now, while the slot is empty for most handlers, is structurally trivial.
- The `options_block` grammar in `06-statement-syntax.md` is already shaped for nested key-value config (used by activity/workflow/nexus call sites). Reusing it on handler declarations is a one-line production change per handler kind.
- The current shape requires a sentinel between the handler signature and the body. `06-statement-syntax.md` solves this for calls using `[NEWLINE options_line]` where `options_line` is the indented block. Handler declarations already have an indented body, so the options block needs to come *between* the signature and the body — same shape as a `state:` block at the top of a workflow.

**Files touched:**
- `tools/spec/sections/01-workflows.md` (extend `signal_decl`, `query_decl`, `update_decl` productions)
- `tools/spec/sections/12-grammar-summary.md` (mirror)
- `tools/spec/sections/06-statement-syntax.md` ("Allowed keys per context" section — add handler-options bullet)

**Change type:** `External` (additive; new optional grammar slot. No existing handler declarations break.)

**Parallelism:** Independent of `REVISIONS_001` and every other open revision. Can ship in any order.

**Specific changes:**

1. **New grammar** in `01-workflows.md`. Replace the current `signal_decl`, `query_decl`, `update_decl` productions with:

   ```
   signal_decl ::= 'signal' IDENT params ':' NEWLINE
                   INDENT
                   [options_block]
                   statement*
                   DEDENT

   query_decl ::= 'query' IDENT params '->' return_type ':' NEWLINE
                  INDENT
                  [options_block]
                  statement*
                  DEDENT

   update_decl ::= 'update' IDENT params '->' return_type ':' NEWLINE
                   INDENT
                   [options_block]
                   statement*
                   DEDENT
   ```

   The `options_block` (if present) appears at the top of the handler body, before any statements — mirrors the existing `state:` block placement at the top of a workflow body.

2. **Update `12-grammar-summary.md`** to reflect the same change.

---

## Group 2: First admitted key — `unfinished_policy`

**Findings:**

- Temporal's `HandlerUnfinishedPolicy` has two values: `Abandon` (silently drop the handler when the workflow exits) and `WarnAndAbandon` (log a warning and drop — the SDK default).
- The choice is a design intent statement. For signal handlers, abandonment is often acceptable; for update handlers, it's a UX failure (the caller waiting on the result gets `NotFound`).
- TWF doesn't model handler-completion-vs-workflow-completion semantics at all today; this key gives designers a way to declare the intent without needing a separate "completion lifecycle" framework.

**Files touched:**
- `tools/spec/sections/06-statement-syntax.md` (add handler-options bullet to "Allowed keys per context")

**Change type:** `External` (additive; new keys for the handler-options context).

**Parallelism:** Builds on Group 1. Land in the same pass.

**Specific changes:**

1. **In `06-statement-syntax.md` "Allowed keys per context" section**, add:

   ```
   Signal handler options: `unfinished_policy` (values: `abandon`, `warn_and_abandon`; default `warn_and_abandon`)

   Update handler options: `unfinished_policy` (values: `abandon`, `warn_and_abandon`; default `warn_and_abandon`)

   Query handler options: (none currently — slot reserved for future use)
   ```

2. **Worked example** to add near the existing activity-options example in `06-statement-syntax.md`:

   ```twf
   signal Cancel():
       options:
           unfinished_policy: abandon
       cancelled = true

   update SubmitJob(job: Job) -> (JobId):
       options:
           unfinished_policy: warn_and_abandon
       activity ValidateJob(job)
       jobId = uuid()
       return jobId
   ```

---

## Group 3: Resolver / validator

**Findings:**

- Unknown option keys at call sites today produce `unknown option key: <key>` errors (see `11-resolution-and-errors.md`). The resolver dispatches the allowed-key check by the *context* of the options block (activity call vs workflow call vs nexus call). Adding handler-options is a new context.
- The new context's allowed-key sets are: signal handler = `{unfinished_policy}`, update handler = `{unfinished_policy}`, query handler = `{}` (empty — slot reserved). Wrong-type and wrong-value-enum errors reuse existing infrastructure.

**Files touched:**
- `tools/spec/sections/11-resolution-and-errors.md` (no new error codes; existing `Unknown option key`, `Wrong value type`, `Invalid enum value` apply)

**Change type:** `Internal` (resolver bookkeeping; uses existing error codes).

**Parallelism:** Same parser PR as Groups 1 + 2.

**Specific changes:**

1. **Resolver dispatch:** when validating an options block attached to a handler declaration (`SignalDecl`, `UpdateDecl`, `QueryDecl`), dispatch the allowed-key check against the appropriate handler-options key set. Reject unknown keys with the existing `unknown option key` error and the handler's source position.

2. **Validator rule:** if `unfinished_policy` is specified on a `QueryDecl`, emit `unknown option key: unfinished_policy` — consistent with how the value would be rejected once `unfinished_policy` lands in the signal/update allowed-key set but not the query set.

---

## Downstream propagation

This REVISIONS is the DSL contract for handler options. After consumption and rename, `/project:propagate-changes` should produce downstream REVISIONS in:

- **`internal/changes/parser/`** — extend `SignalDecl` / `QueryDecl` / `UpdateDecl` AST nodes with an optional `Options *OptionsBlock` field; allow `options_block` parsing at the head of the handler body; extend the validator's allowed-key dispatch with the handler-options contexts.
- **`internal/changes/visualizer/`** — display handler-level options on handler nodes (small chip / annotation near the handler name when present). No new edge kinds. Minor change.
- **`internal/changes/design-skill/`** — extend `skills/design/topics/signals-queries-updates.md` with an "Handler Options" subsection covering `unfinished_policy` semantics: when each value is appropriate, the design implication for update callers (NotFound on abandon), and the relationship to the "all-handlers-finished" wait pattern (BACKLOG item).
- **`internal/changes/author-go-skill/`** — update `skills/author-go/reference/signal-handler.md` and `skills/author-go/reference/update-handler.md` to map `unfinished_policy` to the Go SDK's `workflow.SignalHandlerOptions{UnfinishedPolicy: ...}` and `workflow.UpdateHandlerOptions{UnfinishedPolicy: ...}` respectively.

## Future per-handler options to reserve mental space for

Not in this REVISIONS — listed only so the grammar slot is understood as forward-looking:

- `description` — experimental in Go SDK (`workflow.UpdateHandlerOptions.Description`); visibility metadata.
- Validator linkage — if `Update Validators` (BACKLOG) ever lands, the validator might be referenced by name from an `update` decl's options block rather than as a sub-block.

## Recommended execution order

1. **Decide on D1–D4** above. Default: ship as proposed.
2. **Groups 1 + 2 + 3** — grammar extension, first allowed key, resolver dispatch. Single parser PR since they share AST and resolver work.
3. **Cascade via `/project:propagate-changes`** to parser, visualizer, design-skill, author-go-skill.
