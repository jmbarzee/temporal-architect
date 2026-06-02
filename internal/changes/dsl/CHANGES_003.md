# DSL Changes

**Source review(s):** ad-hoc design review of signal-handling coverage (May 2026), narrowed by a critical design review (June 2026) that scoped the feature to handle-bound, statement-only sends.
**REVISIONS file(s):** `internal/changes/dsl/REVISIONS_001.md` (consumed)

## Summary

Added send-side syntax for signals: a workflow can now signal a child it holds a handle to, via `signal handle.Name(args)`. The feature is deliberately minimal — **handle-bound only** (no external/ID addressing) and **statement-only** (no `await`/`promise`/`await one` form), because a signal carries no return value and the only awaitable thing is send-acceptance, which is not handler execution. External-addressed sends were scoped out and recorded in `BACKLOG.md`.

## Changes by Type

### Grammar

- **`tools/spec/sections/06-statement-syntax.md` § Signal Send (new)**: `signal_send_stmt ::= 'signal' send_target args NEWLINE`, `send_target ::= ident_handle_target`, `ident_handle_target ::= IDENT '.' IDENT` (handle = workflow-bound promise; second IDENT = signal name on the target). Includes the fire-and-forget rationale and the `OrderSaga` worked example.
- **`tools/spec/sections/05-statements.md`**: `signal_send_stmt` added to the workflow statement set (not the activity set).
- **`tools/spec/sections/12-grammar-summary.md`**: mirrored the `signal_send_stmt` / `send_target` / `ident_handle_target` productions and added `signal_send_stmt` to the `statement` union. The `await_stmt`/`async_target` unions are intentionally unchanged (send is not an await/async target).

### Semantic

- **`tools/spec/sections/10-context-restrictions.md`**: cross-workflow signal send follows the same context surface as a `workflow` call — valid in a workflow body, signal handler, update handler, or sync nexus operation body; rejected in an activity body or query handler.
- **`tools/spec/sections/11-resolution-and-errors.md`**: new resolution rule (handle must resolve to a workflow-bound `promise`; the target workflow must declare the named signal) and two new error entries (handle-not-workflow-typed; signal-name-not-declared-by-target).

### Documentation

- **`tools/spec/sections/13-cross-workflow-signals.md` (new section)**: concept-organized page covering the send side, handle-bound only, with the fire-and-forget semantics (send-acceptance, not handler execution) and its throughput tradeoff stated explicitly. Notes that a workflow-bound promise serves two roles (awaitable + signal target). Stays silent on absent capabilities (external addressing, cross-workflow query/update), per spec convention.
- **`tools/spec/sections/00-overview.md`**: added a "Cross-cutting topics" pointer to the new section.
- **`tools/spec/sections/01-workflows.md`**: added a pointer from "Signal Declarations" to the new section.
- **`tools/spec/sections/08-tokens-and-keywords.md`**: documented the third use of the `signal` keyword (send statement) and that a `.` after the name disambiguates a send from an arrival. **No new keyword was added.**

## Downstream propagation

`/project:propagate-changes` should produce downstream REVISIONS from this CHANGES file:

- **`internal/changes/parser/`** — add `SignalSendStmt` as a new statement node (not an `AsyncTarget`; send is statement-only). Parser: statement form only, via `workflowStmtParsers[token.SIGNAL]` with one-token lookahead for `.` to distinguish from an arrival target. No lexer change (no new keyword). **Signal tracing is the high-value deliverable, not incidental:**
  - **Existence / resolution check** — the handle must resolve to a workflow-bound `promise`, and the target workflow must *declare* the named signal. This is the first resolver rule that follows a promise to *what it resolves to* (`PromiseStmt.Target` is a `*WorkflowTarget`) and then inspects that target's signal set. Two new errors: handle-not-workflow-typed; signal-not-declared-by-target.
  - **Graph edge kind** — emit a distinct `signalSend` edge from the sending workflow/handler to the target workflow (keyed on the resolved handle, not the promise name), as its own filterable category (fire-and-forget, no result) — not a reuse of the call edge.
  - **Interaction caveats** — a fire-and-forget send is valid even if the handle is never awaited, so do not fold signal-send into unused-promise heuristics; and a workflow-bound promise used *only* as a signal target (never awaited) must not be flagged "result never consumed."
- **`internal/changes/visualizer/`** — render the `signalSend` edge kind; unblock "Message Flow Edges" and "Handler Show Callers" from `visualizer/BACKLOG.md`; add it as its own toggle in the unified filter bar.
- **`internal/changes/design-skill/`** — extend `skills/design/topics/signals-queries-updates.md` with a "Sending Signals to a Child Workflow" section (handle-bound statement form; fire-and-forget semantics explicit). Do not describe await/promise send forms — they do not exist.
- **`internal/changes/author-go-skill/`** — new `skills/author-go/reference/signal-send.md` mapping the statement form to `ChildWorkflowFuture.SignalChildWorkflow` (the SDK returns a future; the DSL statement maps to the fire-and-forget call); add a forward reference from `workflow-call.md`.

## Deferred (in `BACKLOG.md`)

- **External-Addressed Signal Sends** — `signal external X(id).Name(args)`. Syntax settled; blocked on a workflow-identity (runtime workflow-ID) mechanism, the same gap that defers the `Workflow ID Call Option`. Should be designed alongside it. Soft keyword for `external` (special only after `signal`) preferred when it returns.
