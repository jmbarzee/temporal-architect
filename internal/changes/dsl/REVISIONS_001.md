# DSL Revisions: Cross-Workflow Messaging (Send Side)

**Source:** ad-hoc design review of signal-handling coverage in the DSL and visualizer (May 2026).
**Reflection file:** none — initiated by direct user request after noticing receive-side signal support has no send-side counterpart. Closes the `Signal/Query/Update Send Statements` entry on `internal/changes/dsl/BACKLOG.md` (after this REVISIONS is consumed, that backlog entry should be replaced with the more specific cross-workflow-update gap noted in Group 6).

## Summary

The DSL fully models the *receive* side of signals — handler declarations, `await signal`, `signal` cases in `await one`, `promise <- signal` — but has no syntax for *sending* a signal to another workflow. The same gap exists for cancellation. The asymmetry shows up in every downstream layer: the parser AST has `SignalDecl` and `SignalTarget` (arrival), but no send-side node; the graph package has no `signalSend` edge kind, so the visualizer's "Message Flow Edges" and "Handler Show Callers" features are blocked (`internal/changes/visualizer/BACKLOG.md`); the author-go skill has `signal-handler.md` but no counterpart for `SignalChildWorkflow` / `SignalExternalWorkflow`.

This revision adds send-side syntax for the two Temporal primitives that workflows can actually invoke on other workflows in the current Go SDK: **signal** and **cancel**. Cross-workflow updates are explicitly excluded — the Go SDK forbids `workflow.UpdateChildWorkflow` / `workflow.UpdateExternalWorkflow` and the official guidance is "use an Activity" ([Temporal Go SDK docs — Workflow message passing](https://docs.temporal.io/develop/go/workflows/message-passing)). Modeling update-send in the DSL would create design surface with no codegen target.

Two addressing models cover the call sites:

1. **Handle-bound**: signal/cancel a child workflow you already hold a promise to. Maps to `ChildWorkflowFuture.SignalChildWorkflow` / context cancellation.
2. **External**: signal/cancel a workflow you only know by type + ID expression. Maps to `workflow.SignalExternalWorkflow` / `workflow.RequestCancelExternalWorkflow`.

Both compose with the existing `AsyncTarget` machinery, so each new operation gets all three forms (statement, await target, promise target) for free.

## Design decisions locked in

These are the calls this REVISIONS file makes. Each is overridable by the user; flag any of them now if you disagree, since downstream propagation depends on them.

| # | Decision | Rationale |
|---|---|---|
| D1 | Keep the `signal` keyword overload | Already overloaded (declaration vs await target); a third meaning disambiguated by syntactic form (dot-qualified target + arg list) is consistent with `workflow`, `activity`, `nexus`. Alternative `send signal` was rejected as verbose. |
| D2 | Require dot-qualified target for sends | `signal handle.Name(args)` reads as "send to handle's Name handler." The leading dot-form is the syntactic tell that disambiguates from arrival targets (`await signal Name`). |
| D3 | Handle binding via existing `promise` | `promise child <- workflow X(args)` already produces a workflow handle. Reuse it instead of inventing new handle syntax. Resolver verifies the promise is workflow-bound. |
| D4 | New `external` keyword for ID-addressed sends | `signal external X(id).Name(args)`. New hard keyword; alternatives (omit, infer by resolution, reuse `workflow`) were rejected as ambiguous. |
| D5 | New `cancel` keyword for cancellation | Single primitive covers both handle-bound and external forms; mirrors signal-send. Statement-only (no result), but composable as async target. |
| D6 | **No** cross-workflow update-send | Go SDK does not support `workflow.UpdateChildWorkflow` / `workflow.UpdateExternalWorkflow`. Adding it to the DSL would create un-codegen-able design surface. Documented as explicit non-goal in spec. |
| D7 | **No** cross-workflow query-send | Queries are client-side primitives (`Client.QueryWorkflow`); the Go SDK has no workflow-level equivalent. Documented as explicit non-goal. |
| D8 | Args remain opaque strings | Consistent with all existing call sites (`ActivityCall.Args`, `WorkflowCall.Args`, `SignalDecl.Params`). No new resolver work beyond name + arity checks. |

---

## Group 1: Handle-bound signal sends

**Findings:**

- The DSL has no syntax for `childFuture.SignalChildWorkflow(ctx, name, arg)` — the most common workflow-to-workflow signal pattern. Designs that need a parent to signal its own child (saga compensation triggers, child-cooperative state updates) currently can't express it at all and have to drop to natural-language comments.
- The `promise p <- workflow X(args)` form already captures the right object (a workflow handle / `ChildWorkflowFuture`). Reusing it for the handle side avoids inventing a parallel "handle" concept.
- Today's `IdentTarget` resolver path already supports `promise` references via `IdentResolution.Promise`. Restricting handle-bound sends to workflow-typed promises is a small extension to the same path.

**Files touched:**
- `tools/spec/sections/06-statement-syntax.md` (add `signal_send` statement and target grammar)
- `tools/spec/sections/05-statements.md` (add `signal_send` to workflow statement set)
- `tools/spec/sections/10-context-restrictions.md` (clarify send is workflow-context-only)
- `tools/spec/sections/11-resolution-and-errors.md` (add handle resolution and unknown-signal-name error)
- `tools/spec/sections/12-grammar-summary.md` (mirror)
- `tools/spec/sections/08-tokens-and-keywords.md` (no new keyword; note `signal` overload)

**Change type:** `External` (additive; new AST node types and JSON output fields. No existing grammar breaks.)

**Parallelism:** Independent of Group 2 (external addressing) at the grammar level; Group 2 reuses the same statement/target slot. Group 3 (cancel) is structurally identical and can be implemented in parallel.

**Specific changes:**

1. **New statement form** in `06-statement-syntax.md`:

   ```
   signal_send_stmt ::= 'signal' send_target args NEWLINE

   send_target ::= ident_handle_target | external_handle_target

   ident_handle_target ::= IDENT '.' IDENT
                          # IDENT 1 = promise bound to a workflow call
                          # IDENT 2 = signal handler name on the target workflow
   ```

   (Group 2 adds `external_handle_target`; both are defined under the same `send_target` non-terminal so the resolver can dispatch on shape.)

2. **New async-target form** (composes with `await` and `promise`):

   ```
   signal_send_target ::= 'signal' send_target args
   ```

   Extends the `await_target` and `async_target` unions in `06-statement-syntax.md` and `12-grammar-summary.md`. Behavior:

   - As statement: `signal child.PaymentReceived(amount)` — fire-and-forget. No result binding.
   - As await: `await signal child.PaymentReceived(amount)` — block until delivery is acknowledged. No result binding (signals don't return values).
   - As promise: `promise sent <- signal child.PaymentReceived(amount)` — capture the delivery future; `await sent` later.

3. **Resolution rules** (additions to `11-resolution-and-errors.md`):

   - For `signal H.N(args)`:
     - `H` must resolve via the existing `IdentTarget` resolver path to a `PromiseStmt`.
     - That promise's `Target` must be a `WorkflowTarget` (not activity, not nexus, not timer, not signal-arrival).
     - The resolved workflow definition must declare a `signal N`. If not, emit `UNDEFINED_SIGNAL_ON_TARGET` with the workflow name and signal name.
     - Args are opaque (consistent with existing call sites). No arity check beyond grammar.
   - New error codes (additive to `11-resolution-and-errors.md` error list):
     - `Signal target handle is not workflow-typed`
     - `Signal name N not declared by target workflow`

4. **Context restriction** (addition to `10-context-restrictions.md`):
   - Signal-send is valid in: workflow body, signal handler body, update handler body, sync nexus operation body.
   - Signal-send is NOT valid in: activity body, query handler body. (Same restriction surface as `workflow` calls.)

5. **Worked example** to add to `06-statement-syntax.md`:

   ```twf
   workflow OrderSaga(order: Order) -> (SagaResult):
       promise pay <- workflow ProcessPayment(order)
       promise ship <- workflow ShipOrder(order)

       # Notify the payment workflow that the order has shipped
       signal pay.OrderShipped(shipmentId)

       # Wait for both to finish
       await all:
           await pay -> payment
           await ship -> shipment
       close complete(SagaResult{payment, shipment})
   ```

---

## Group 2: External-addressed signal sends

**Findings:**

- The handle pattern (Group 1) covers only call sites where the sender holds a child handle. Many real designs need to signal a workflow the sender did not start (entity workflows addressed by business ID, sibling workflows in a sharded design, cross-saga compensation).
- Temporal's `workflow.SignalExternalWorkflow(ctx, workflowID, runID, name, arg)` is the SDK primitive. The natural DSL surface is "name the workflow type so we can type-check the signal, leave the ID as an opaque expression."
- Adding `external` as a hard keyword is cheaper than the alternatives (overload `workflow`, infer addressing mode from resolver) and reads clearly at the call site.

**Files touched:**
- `tools/spec/sections/06-statement-syntax.md`
- `tools/spec/sections/08-tokens-and-keywords.md` (add `external` to keyword list)
- `tools/spec/sections/11-resolution-and-errors.md`
- `tools/spec/sections/12-grammar-summary.md`

**Change type:** `External` (additive; new keyword token, new AST target type).

**Parallelism:** Builds on Group 1's `signal_send_stmt` / `signal_send_target` slot — just adds a second `send_target` form. Can be authored alongside Group 1 in the same parser PR.

**Specific changes:**

1. **New grammar** in `06-statement-syntax.md`:

   ```
   external_handle_target ::= 'external' IDENT '(' expr ')' '.' IDENT
                            # 'external' WorkflowType(idExpr).HandlerName
   ```

   Optional second form for run-pinned addressing (defer to BACKLOG if you'd rather punt on it):

   ```
   external_handle_target ::= 'external' IDENT '(' expr [',' expr] ')' '.' IDENT
                            # second expr is the runId
   ```

   Recommend: ship the single-expr form now, defer the runId form. Most external signals address a workflow by stable business ID, not a specific run.

2. **New keyword** `external` added to `08-tokens-and-keywords.md` under "Cross-workflow messaging" (a new subsection — see Group 4). Hard keyword, lexed unconditionally.

3. **Resolution rules** (additions to `11-resolution-and-errors.md`):

   - For `signal external X(id).N(args)`:
     - `X` must resolve to a `WorkflowDef`. If not, emit `UNDEFINED_WORKFLOW` (same code used for unresolved workflow calls).
     - `X` must declare a `signal N`. If not, emit `UNDEFINED_SIGNAL_ON_TARGET`.
     - `id` is an opaque expression; no validation.
   - If `X` does not resolve at all (no local workflow definition), the resolver may emit a warning rather than an error — same convention as unresolved nexus endpoints in `03-workers-and-namespaces.md`. The target workflow may live outside the current `.twf` set.

4. **Worked example** to add to `06-statement-syntax.md`:

   ```twf
   workflow OrderCoordinator(orderId: string):
       # Signal a long-running entity workflow we did not start
       signal external OrderEntity(orderId).OrderShipped(trackingNumber)

       # Or capture delivery as a promise
       promise sent <- signal external OrderEntity(orderId).OrderShipped(trackingNumber)
       await sent
   ```

---

## Group 3: Cancellation primitive

**Findings:**

- The DSL has no syntax for `RequestCancelExternalWorkflow` or for cancelling a child workflow. Cancellation is a first-class Temporal concept — most production workflows need it — and is currently invisible in TWF designs.
- The `internal/changes/dsl/BACKLOG.md` "Workflow Cancellation Handler" entry covers the *receive* side (`on_cancel:` blocks). This REVISIONS covers the *send* side. The two are independent and can land separately.
- Cancel mirrors signal-send structurally: same two addressing modes (handle / external), same three forms (statement / await / promise), no result binding. Bundling it here costs one extra keyword (`cancel`) and reuses all the resolution machinery.

**Files touched:**
- `tools/spec/sections/06-statement-syntax.md`
- `tools/spec/sections/08-tokens-and-keywords.md` (add `cancel` keyword)
- `tools/spec/sections/10-context-restrictions.md`
- `tools/spec/sections/11-resolution-and-errors.md`
- `tools/spec/sections/12-grammar-summary.md`

**Change type:** `External` (additive; new keyword token, new AST node type).

**Parallelism:** Independent of Groups 1 and 2 at the grammar level. Shares resolution machinery with both. Can be deferred to a follow-up REVISIONS if you'd rather scope this cycle tighter; flag now if so.

**Specific changes:**

1. **New grammar** in `06-statement-syntax.md`:

   ```
   cancel_stmt   ::= 'cancel' cancel_target NEWLINE
   cancel_target ::= IDENT                              # handle-bound
                  | 'external' IDENT '(' expr ')'       # external by ID
   ```

   And as an async target:

   ```
   cancel_async_target ::= 'cancel' cancel_target
   ```

   Behavior parallels signal-send (statement = fire-and-forget; `await cancel h` = wait for cancel ack; `promise c <- cancel h` = capture as promise).

2. **New keyword** `cancel` added to `08-tokens-and-keywords.md`. Hard keyword.

3. **Resolution rules** (additions to `11-resolution-and-errors.md`):
   - For `cancel H`: `H` must resolve to a workflow-typed promise (same check as Group 1's handle resolution).
   - For `cancel external X(id)`: `X` must resolve to a `WorkflowDef`, or warn if no local definition exists. `id` opaque.

4. **Context restriction** (addition to `10-context-restrictions.md`): same surface as signal-send.

5. **Worked example** to add:

   ```twf
   workflow OrderSaga(order: Order) -> (SagaResult):
       promise pay <- workflow ProcessPayment(order)
       promise inventory <- workflow ReserveInventory(order)

       await one:
           await pay -> payment:
               # Payment succeeded — wait for inventory
               await inventory -> reservation
               close complete(SagaResult{payment, reservation})
           await inventory -> reservation:
               # Inventory came first; wait for payment
               await pay -> payment
               close complete(SagaResult{payment, reservation})
           timer(30m):
               # Timed out — cancel both
               cancel pay
               cancel inventory
               close fail("saga timeout")
   ```

---

## Group 4: Spec reorganization — "Cross-Workflow Messaging" section

**Findings:**

- Signal/cancel/handler material is currently scattered: handler declarations in `01-workflows.md`, await/promise/case targets in `06-statement-syntax.md`, context restrictions in `10-context-restrictions.md`. A reader looking for "how does workflow A signal workflow B?" has to read all three to discover the answer used to be "you can't."
- After Groups 1–3 land, the asymmetry that produced this REVISIONS will be gone, but the spec navigation problem will remain unless we group the cross-workflow material in one place.
- Existing sections are organized by syntactic shape (definitions, statements, expressions). The new section should be organized by *concept* (cross-workflow messaging) and cross-reference the syntactic sections. Same pattern as Temporal's own docs.

**Files touched:**
- `tools/spec/sections/` (new file, suggested name `13-cross-workflow-messaging.md`)
- `tools/spec/sections/00-overview.md` (add to the See list)
- `tools/spec/sections/01-workflows.md` (cross-reference from Signal Declarations section)

**Change type:** `Internal` (pure reorganization; no grammar changes).

**Parallelism:** Should ship *with* or *after* Groups 1–3 — writing it before the grammar is locked invites rework. Independent of the actual implementation work in those groups.

**Specific changes:**

1. **New section file** `13-cross-workflow-messaging.md` with the following structure:

   ```
   # Cross-Workflow Messaging

   Mechanisms by which one workflow communicates with another while both are running.

   ## Overview

   | Primitive | Direction | Send side | Receive side | Result |
   |---|---|---|---|---|
   | Signal | One-way notification | signal handle.Name(args) | signal Name(params): handler | None |
   | Cancel | One-way termination request | cancel handle | (handled by Temporal runtime / on_cancel: in future) | None |
   | Update | Request-response | NOT supported workflow→workflow | update Name(params): handler | Result returned to caller |
   | Query  | Read | NOT supported workflow→workflow | query Name(params): handler | Result returned to caller |

   ## Addressing

   ### Handle-bound (child workflows)
   ... pointer to 06-statement-syntax.md grammar, summary example ...

   ### External (by workflow ID)
   ... pointer to 06-statement-syntax.md grammar, summary example ...

   ## Composition with await and promise
   ... explain the three forms ...

   ## Non-goals
   ... see Group 6 ...
   ```

2. **In `01-workflows.md`**, add a one-line pointer at the end of "Signal Declarations": *"For sending signals to other workflows, see [Cross-Workflow Messaging](./13-cross-workflow-messaging.md)."*

3. **In `00-overview.md`**, add the new file to the See list.

---

## Group 5: Token / keyword inventory bump

**Findings:**

- Adds two hard keywords: `external` (Groups 1–3 use it) and `cancel` (Group 3 uses it).
- `08-tokens-and-keywords.md` already groups keywords by purpose ("Async workflow operations," "Workflow primitives," etc.). A new "Cross-workflow messaging" subgroup keeps the inventory readable.
- The `signal` keyword now has three uses (handler declaration, arrival target, send statement/target). Worth a short note in the keyword reference so first-time readers know to disambiguate by syntactic form, not by keyword.

**Files touched:**
- `tools/spec/sections/08-tokens-and-keywords.md`

**Change type:** `Internal` (keyword inventory update; the grammar changes live in Groups 1–3).

**Parallelism:** Trivial; combine with whichever of Groups 1–3 ships first.

**Specific changes:**

1. New subsection in `08-tokens-and-keywords.md`:

   ```
   **Cross-workflow messaging:**
   - `external` - Addresses a workflow by type + ID expression (e.g. `signal external X(id).Name(args)`)
   - `cancel` - Requests cancellation of a workflow (`cancel handle` or `cancel external X(id)`)
   ```

2. Update the `signal` keyword entry to note the three uses:

   ```
   - `signal` - Three uses: (a) handler declaration at the top of a workflow, (b) arrival target in await/promise/await-one (`await signal Name`), (c) send statement/target with a dot-qualified target (`signal handle.Name(args)`, `signal external X(id).Name(args)`). Disambiguated by syntactic context.
   ```

---

## Group 6: Explicit non-goals

**Findings:**

- Three plausible cross-workflow primitives are deliberately NOT in this REVISIONS. Each is excluded for a specific SDK reason. Documenting them in the spec prevents re-proposal and gives readers an answer when they go looking.
- Without explicit non-goals, the asymmetry pattern that produced this whole exercise (handler-without-sender) will quietly reappear for updates and queries.

**Files touched:**
- `tools/spec/sections/13-cross-workflow-messaging.md` (the new file from Group 4, under "Non-goals")
- `internal/changes/dsl/BACKLOG.md` (replace the existing "Signal/Query/Update Send Statements" entry with a tighter "Cross-Workflow Update Send" entry that records the SDK constraint)

**Change type:** `Internal` (documentation only).

**Parallelism:** Ships with Group 4 (needs the new file).

**Specific items to document as non-goals:**

1. **Cross-workflow update-send.** Temporal Go SDK does not support `workflow.UpdateChildWorkflow` or `workflow.UpdateExternalWorkflow`. The official guidance is "use an Activity to bridge" — the activity calls back into Temporal via `client.UpdateWorkflow`. Adding `update handle.Name(args) -> result` to the DSL would compile to "this isn't possible in Go." Excluded until SDK support lands, at which point it slots in trivially using the Group 1 / Group 2 machinery.

2. **Cross-workflow query-send.** Queries are a client-side primitive (`Client.QueryWorkflow`). The Go SDK has no `workflow.QueryWorkflow` equivalent and likely never will — queries replay history and are intentionally restricted to client contexts where staleness is acceptable. Excluded permanently.

3. **Signal-with-start.** `Client.SignalWithStartWorkflow` is client-only; the in-workflow equivalent is `SignalExternalWorkflow` after a separate `ExecuteChildWorkflow`. The DSL can already express this as two statements (`workflow X(args)` then `signal external X(id).Name(args)`); a fused primitive would save tokens but adds a third addressing model. Defer until a real design needs it.

---

## Downstream propagation

This REVISIONS file is the DSL contract. After it is consumed and renamed to `CHANGES_003.md`, `/project:propagate-changes` should produce downstream REVISIONS in:

- **`internal/changes/parser/`** — implement the AST additions (`SignalSendStmt`, `SignalSendTarget`, `CancelStmt`, `CancelTarget`), lexer additions (`external`, `cancel` tokens), parser productions, resolver rules, graph package additions (new `signalSend` and `cancelSend` edge kinds).
- **`internal/changes/visualizer/`** — render new edge kinds; unblock "Message Flow Edges" and "Handler Show Callers" from `visualizer/BACKLOG.md`; add the new types to the unified filter bar / type toggles.
- **`internal/changes/design-skill/`** — extend `skills/design/topics/signals-queries-updates.md` with a "Sending Signals to Other Workflows" section; add cancel to a new or existing topic; note the cross-workflow-update non-goal.
- **`internal/changes/author-go-skill/`** — new `skills/author-go/reference/signal-send.md` mapping the four send forms to `SignalChildWorkflow` / `SignalExternalWorkflow`; new `cancel.md` for `RequestCancelExternalWorkflow` and child context cancellation; update `workflow-call.md` (line ~31, "communication is through signals only") with a forward reference.

## Recommended execution order

1. **Decide on D1–D8** above. The choices below depend on these. Default: ship as proposed.
2. **Group 1** (handle-bound signal sends) — smallest viable slice; gives parser + visualizer + skills something concrete to consume.
3. **Group 2** (external addressing) and **Group 3** (cancel) — can land together with Group 1 in one parser pass, since they reuse the same statement slot and resolution machinery. Worth bundling unless you want a tighter first slice.
4. **Group 4–6** (spec reorganization, keyword inventory, non-goals) — pure documentation; can ship in the same commit as Group 1 or follow once the grammar is stable.
