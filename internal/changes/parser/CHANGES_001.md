# Parser Changes

**Source review(s):** `review-alignment-parser` (propagated from `internal/changes/dsl/CHANGES_003.md` — cross-workflow signal send)
**REVISIONS file(s):** `internal/changes/parser/alignment_REVISIONS_001.md` (consumed)

## Summary

Propagated the handle-bound, statement-only cross-workflow signal send (`signal handle.Name(args)`) through the parser: a new AST node, body-statement parsing, name resolution that follows the handle to its target workflow and verifies the signal, and a distinct graph edge. Previously the construct silently misparsed as a lossy `RawStmt` (no node, no resolution, no edge, no error); it is now a first-class, traced construct end-to-end.

## Changes by Type

### Grammar

- **`signal_send_stmt`** is now recognized as a workflow body statement: `signal handle.Name(args)`, registered in `workflowStmtParsers[token.SIGNAL]` (`parser/parser/parser.go`, `parser/parser/statements_signal.go`). No lexer or token changes (`signal` is already `token.SIGNAL`; `.` is `token.DOT`). It is statement-only — not an `AsyncTarget`, await target, `await one` case, or `promise` RHS.
- **Known limitation (by design):** a signal send cannot be the *first* statement in a workflow body. The declaration region (`state` → signal/query/update decls → statements) intercepts a leading `signal` as a declaration. Precede the send with any statement (a comment does not suffice — comments are skipped in the declaration region). A leading send is reported as a malformed signal declaration; once the body has started, every `signal` is unambiguously a send and a missing `.` yields a targeted "signal arrivals must be awaited; a send requires `handle.Name(args)`" error.

### Schema

- New statement node in the parser JSON: `{"type":"signalSend","line","column","handle","signal","args","resolved?"}`. `resolved` is a reference to the **target workflow** (`name`/`line`/`column`) the handle was started against — populated after resolution — so consumers can draw the edge without re-deriving it.
- New graph JSON edge-kind enum value `"signalSend"` (`edges[].kind`, and `unresolved[].kind` for unresolved sends). The `signalSend` edge carries a present-but-empty `routing: {}` block (no `task_queue` semantics).

### API

- New AST type `ast.SignalSendStmt{ Handle Ref[*PromiseStmt]; Signal string; Args string }` (`parser/ast/ast.go`); does not implement `asyncTarget()`. `marshalStatement` handles it (`parser/ast/json.go`).
- New resolver error kinds + stable codes (`parser/resolver/resolver.go`): `ErrSignalSendHandleNotWorkflow` → `SIGNAL_SEND_HANDLE_NOT_WORKFLOW`; `ErrSignalSendUndefinedSignal` → `SIGNAL_SEND_UNDEFINED_SIGNAL`. These join the diagnostic contract consumed by the LSP/VS Code layers.
- New graph edge constant `graph.EdgeSignalSend = "signalSend"` (`parser/graph/graph.go`).

### Semantic

- **Resolution** (`resolveSignalSend`): the handle must resolve to a workflow-bound `promise`; the target workflow must declare the named signal. This is the first resolver rule that follows a promise to *what it resolves to* (`PromiseStmt.Target` → `*WorkflowTarget` → resolved `*WorkflowDef` → `Signals`). Reuses `ErrUndefinedPromiseOrCondition` for an undefined handle; emits the two new codes for the not-workflow and signal-not-declared cases; degrades gracefully (no duplicate, no panic, handle left unresolved) when the target workflow name is itself undefined. On full success it links `Handle.Resolved`.
- **Graph** (`emitSignalSend`): emits a distinct `signalSend` edge from the sending workflow/handler to the target workflow's deployment(s) **in the caller's namespace** — a signal is delivered to a child the sender already started, not task-queue-matched, so it does not reuse the queue-routed dispatch path and carries no `task_queue` routing. Unresolved sends record an `Unresolved{kind:"signalSend"}` entry rather than dropping silently.
- **Context restrictions:** the send remains rejected in activity bodies and query handlers (via the existing `temporalKeywords` gate) and is allowed in workflow / signal-handler / update-handler / sync-nexus-op bodies, matching `10-context-restrictions.md`.
- **Validator guard:** a `signal h.Name(...)` is treated as a *use* of the handle promise. No unused-promise heuristic exists today; an anchor comment + regression test ensure a future one cannot flag a workflow-bound promise consumed solely by a signal send as "unused" / "result never consumed".

### Internal

- Added 12 regression tests across parser, resolver, graph, and validator covering parsing, the first-statement limitation and workaround, all three resolution error paths plus graceful degrade, the distinct graph edge and its unresolved fallback, and the validator use-guard.

## Downstream propagation

`/project:propagate-changes` should fan this out:

- **`internal/changes/visualizer/`** — render the new `signalSend` edge kind. Reuse the existing edge-kind rendering and filtering affordances; **do not add a signal-specific filter mechanism** — `signalSend` should ride the existing edge-kind handling like any other edge kind. The `resolved` target-workflow ref on the `signalSend` node is available if a node-level affordance is wanted.
- **`internal/changes/design-skill/`** — covered by `internal/changes/design-skill/CHANGES_001.md` (send-side section added).
