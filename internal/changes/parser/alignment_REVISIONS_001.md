# Parser Alignment Revisions — Cross-Workflow Signal Send

**Source:** `internal/changes/dsl/CHANGES_003.md`
**Spec sections:** `06-statement-syntax.md` § Signal Send, `05-statements.md`, `12-grammar-summary.md`, `10-context-restrictions.md`, `11-resolution-and-errors.md`, `13-cross-workflow-signals.md`

## Summary

Scope is narrow: propagate the newly-specified **handle-bound, statement-only cross-workflow signal send** (`signal handle.Name(args)`) into the parser. This is a single construct, not a full audit.

**Coverage state: `missing` (silent, lossy misparse).** `token.SIGNAL` is not registered in `workflowStmtParsers` (`parser.go`), so a `signal …` statement in a workflow body falls through to `parseRawStmt`. Confirmed empirically: parsing

```twf
workflow OrderSaga(order):
    promise pay <- workflow ProcessPayment(order)
    signal pay.OrderShipped(shipmentId)
```

yields `body[1] = *ast.RawStmt{Text:"signal pay.OrderShippedshipmentId"}` — the construct is swallowed as raw text, the `.` and the parenthesized args are mangled/dropped, and **no AST node, no resolution, no graph edge, and no errors** are produced. Per the command's prioritization this is worse than a clean "missing" failure: the send silently disappears from every downstream consumer.

The send is **statement-only**: it is NOT an `AsyncTarget`, NOT an await target, NOT an `await one` case, and NOT a `promise` RHS. The `await_stmt` / `async_target` unions must stay unchanged. No lexer/token work is needed (`signal` is already `token.SIGNAL`; `.` is `token.DOT`).

Per CHANGES_003, **signal tracing is the high-value deliverable** — the resolver must follow the handle promise to the workflow it resolves to and verify the target declares the named signal, and the graph must emit a distinct `signalSend` edge. These (Groups 2 and 3) are the point of the work, not afterthoughts.

Groups are ordered so the AST/parser node (Group 1) lands first; Groups 2 and 3 both depend on it but are independent of each other. Group 4 is a guard note.

---

## Group 1: `SignalSendStmt` node, statement parser, dispatch, serialization & walker

**Gaps addressed:**
- `signal handle.Name(args)` is not recognized as a workflow statement (`missing`; currently a lossy `RawStmt`).
- No AST node exists for the construct.
- Grammar: `signal_send_stmt ::= 'signal' send_target args NEWLINE`, `send_target ::= ident_handle_target`, `ident_handle_target ::= IDENT '.' IDENT`.

**Work:**
1. **AST node (`ast/ast.go`):** add `type SignalSendStmt struct { Pos; Handle Ref[*PromiseStmt]; Signal string; Args string }` with `func (*SignalSendStmt) stmtNode() {}`. `Handle` is a `Ref[*PromiseStmt]` so resolution can attach the resolved workflow-bound promise (the handle), keyed on the resolved handle rather than the bare name. `Signal` holds the second IDENT (the signal name on the target); `Args` is the opaque parenthesized literal. It deliberately does **not** implement `asyncTarget()`.
2. **Statement parser (`parser/statements_async.go` or a new `statements_signal.go`):** add `parseSignalSendStmt`:
   - consume `SIGNAL`, `expect(token.IDENT)` (handle), `expect(token.DOT)`, `expect(token.IDENT)` (signal name), `expect(token.ARGS)`, optional trailing `NEWLINE`.
   - **Disambiguation / clear errors:** a bare `signal` at statement start is unambiguously a send (arrivals only ever appear under `await` / `promise` / `await one`, never as a leading statement). Use the one-token lookahead the spec calls out (`p.peek` after the handle IDENT) so that `signal Foo` *without* a `.` produces a targeted error (e.g. "signal arrivals must be awaited; a send requires `handle.Name(args)`") instead of a generic `expected DOT`.
3. **Dispatch (`parser/parser.go`):** register `token.SIGNAL: parseSignalSendStmt` in `workflowStmtParsers`. Do **not** add it to `activityStmtParsers`; `token.SIGNAL` already sits in `temporalKeywords`, so it remains rejected in activity and query-handler bodies with "signal is not allowed in activity body" — which matches `10-context-restrictions.md` (valid in workflow / signal-handler / update-handler / sync-nexus-op bodies via `bodyWorkflow`; rejected in activity body and query handler via `bodyActivity`). Confirm query handlers route through `bodyActivity`.
4. **JSON serialization (`ast/json.go`):** add a `*SignalSendStmt` case to `marshalStatement` (otherwise marshaling errors with "unhandled statement type"). Emit `{"type":"signalSend","line","column","handle","signal","args","resolved?"}`, where `resolved` mirrors `resolvedRefJSON` pointing at the resolved handle promise / target workflow (decide the exact shape alongside the visualizer contract; at minimum surface the resolved target workflow name so the visualizer can draw the edge). Add the matching `signalSendStmtJSON` struct.
5. **Walker (`ast/walk.go`):** `SignalSendStmt` has no child bodies and no `AsyncTarget`, so `AsyncTargetOf` and the `walkStatement` child-switch need no new traversal — but verify the new node flows through `WalkStatements` cleanly (it does, since `fn(stmt)` is always called first). No change to `WithAsyncTargets`.

**Files touched:** `parser/ast/ast.go`, `parser/parser/parser.go`, `parser/parser/statements_async.go` (or new `statements_signal.go`), `parser/ast/json.go`, `parser/ast/walk.go` (verify only).
**Change type:** `Grammar` + `API`.
**Parallelism:** Foundational — must land before Groups 2 and 3. Sub-tasks within (AST/parser vs JSON) can proceed together once the node type exists.

---

## Group 2: Resolution — follow the handle to its workflow & verify the signal (high-value)

**Gaps addressed:**
- New resolution rule (`11-resolution-and-errors.md`): the handle must resolve to a **workflow-bound** `promise`, and the target workflow must **declare** the named signal.
- Two new error entries: handle-not-workflow-typed; signal-name-not-declared-by-target.

**Work:**
1. **Hook into the statement switch (`resolver/resolver.go`, `resolveStatements`):** add a `case *ast.SignalSendStmt:` to the `WalkStatements` callback (the plain statement switch, **not** `resolveAsyncTarget` — a send is not an async target). Implement `resolveSignalSend`:
   - Look up `s.Handle.Name` in `c.promises`. If absent → undefined-handle error. Reuse `ErrUndefinedPromiseOrCondition` (or, if a tighter message is wanted, a dedicated kind — note it but reuse is acceptable since the spec's two *new* kinds are the two below).
   - If found, inspect `promise.Target`. If it is not a `*ast.WorkflowTarget` → **new** `ErrSignalSendHandleNotWorkflow` ("signal-send handle is not a workflow-bound promise; the handle must come from `promise h <- workflow X(args)`"). This is the first resolver rule that follows a promise to *what it resolves to*.
   - If workflow-typed, take `WorkflowTarget.Workflow.Resolved` (the target `*ast.WorkflowDef`; depends on the existing workflow-call resolution already having run on that promise) and check its `Signals` slice for one whose `Name == s.Signal`. On miss → **new** `ErrSignalSendUndefinedSignal` ("signal %q is not declared by workflow %s"). On hit, set `s.Handle.Resolved = promise` (and optionally cache the resolved target workflow / signal decl for the graph + JSON).
   - Guard the `WorkflowTarget.Workflow.Resolved == nil` case (target workflow name itself unresolved) so signal-send resolution degrades gracefully rather than panicking.
2. **Error kinds (`resolver/resolver.go`):** add `ErrSignalSendHandleNotWorkflow` and `ErrSignalSendUndefinedSignal` to the `ErrorKind` iota block and to `ErrorKind.String()` with stable codes (`SIGNAL_SEND_HANDLE_NOT_WORKFLOW`, `SIGNAL_SEND_UNDEFINED_SIGNAL`). These codes are part of the diagnostic contract consumed by the LSP/VS Code layers.

**Files touched:** `parser/resolver/resolver.go` (and `resolver` tests).
**Change type:** `Semantic` (+ error-model `API` for the two new codes).
**Parallelism:** Depends on Group 1 (needs the AST node). Independent of Group 3.

---

## Group 3: Graph — distinct `signalSend` edge kind (high-value)

**Gaps addressed:**
- Emit a distinct `signalSend` edge from the sending workflow/handler to the target workflow, keyed on the **resolved handle**, as its own filterable category — explicitly **not** a reuse of `workflowCall`.

**Work:**
1. **Edge kind constant (`graph/graph.go`):** add `EdgeSignalSend = "signalSend"` to the edge-kind block, alongside `EdgeWorkflowCall` etc.
2. **Emit in `walkRunnable` (`graph/routing.go`):** add a `case *ast.SignalSendStmt:` to the statement switch in `walkRunnable` (the plain-statement arm, not the `WithAsyncTargets` arm). Resolve the target workflow via the statement's resolved handle (`s.Handle.Resolved.Target.(*ast.WorkflowTarget).Workflow.Resolved`, or whatever resolved field Group 2 caches) and emit an edge from `callerID` to the target workflow's deployment node(s).
   - **Routing decision (call out explicitly):** a signal is delivered to a *specific running child the sender started*, not dispatched by task-queue matching the way a fresh `workflowCall` is. Decide and document whether the edge fans out to all deployments of the target workflow in the caller's namespace, or carries no `Routing` block (fire-and-forget, no queue override). Recommended: emit to the target workflow's deployment(s) in the same namespace, with an empty/absent `Routing` (no `task_queue` semantics), distinct from the queue-routed `emitQueuedCall` path. Add an `emitSignalSend` helper rather than threading through `emitWorkflowCall`.
   - If the handle/target is unresolved, record an `Unresolved` entry with `Kind: EdgeSignalSend` (mirroring `emitWorkflowCall`'s unresolved handling) rather than silently dropping it.
3. Keep the new edge in `finalize()` sort order automatically (sorts by kind already — no change needed).

**Files touched:** `parser/graph/graph.go`, `parser/graph/routing.go` (and graph tests). The visualizer REVISIONS (separate, per CHANGES_003) consume this `signalSend` enum value as a new filter toggle.
**Change type:** `API` (new edge enum in the graph JSON contract) + `Semantic`.
**Parallelism:** Depends on Group 1 (AST node) and Group 2 (resolved handle → target workflow). Independent of Group 2's error work otherwise.

---

## Group 4: Interaction caveats — guard fire-and-forget against future "unused" heuristics

**Gaps addressed (preventative, per CHANGES_003):**
- A fire-and-forget send is valid even if the handle is never awaited — must not be folded into unused-promise heuristics.
- A workflow-bound promise used **only** as a signal target (never awaited) must not be flagged "result never consumed."

**Findings & work:**
- No "unused promise" / "result never consumed" check currently exists in `parser/resolver/` or `parser/validator/` (grep found none), so there is **no active misflag to fix today**. The work is to (a) record this constraint where a future heuristic would live, and (b) ensure that when such a check is added, a `SignalSendStmt` referencing a handle counts as a *use* of that promise. A short comment/test in the validator capturing "a promise referenced only by `signal h.Name(...)` is still considered used" is enough to lock the behavior in.
- Concretely: add a validator test asserting that a workflow-bound promise consumed solely by a signal send produces no warning, so the guard survives future changes.

**Files touched:** `parser/validator/validator.go` (comment/anchor only), `parser/validator/validator_test.go` (regression test).
**Change type:** `Semantic` (guard).
**Parallelism:** Depends on Group 1 (AST node) and Group 2 (resolution). Lowest priority; can land last.
