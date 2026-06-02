# DSL Revisions: Handle-Bound Signal Sends

**Source:** ad-hoc design review of signal-handling coverage in the DSL and visualizer (May 2026), narrowed during a critical design review (June 2026) that scoped external-addressed sends out of this cycle.
**Reflection file:** none — initiated by direct user request after noticing receive-side signal support has no send-side counterpart. Narrows the `Signal/Query/Update Send Statements` entry on `internal/changes/dsl/BACKLOG.md` (after this REVISIONS is consumed, that backlog entry should be renamed `Cross-Workflow Update / Query Sends` and reduced to update/query coverage only). A new backlog entry, `External-Addressed Signal Sends`, captures the deferred work and its blocker (see below).

## Summary

The DSL fully models the *receive* side of signals — handler declarations, `await signal`, `signal` cases in `await one`, `promise <- signal` — but has no syntax for *sending* a signal to another workflow. The asymmetry shows up in every downstream layer: the parser AST has `SignalDecl` and `SignalTarget` (arrival), but no send-side node; the graph package has no `signalSend` edge kind, so the visualizer's "Message Flow Edges" and "Handler Show Callers" features are blocked (`internal/changes/visualizer/BACKLOG.md`); the author-go skill has `signal-handler.md` but no counterpart for `SignalChildWorkflow`.

This revision adds send-side syntax for **one addressing model only: handle-bound signal sends** — signalling a child workflow you already hold a promise to. Cancellation send and `on_cancel:` receive remain in BACKLOG and are intentionally out of scope. Cross-workflow update-send and query-send are not addressed at any layer (see D6). The grammar designed below leaves the syntactic slots (`update handle.X(args) -> r`, `query handle.X() -> r`) available by absence — the DSL is simply silent on them, in the same way it is silent on every other Temporal capability the user has not yet asked for.

**One addressing model is in scope:**

1. **Handle-bound**: signal a child workflow you already hold a promise to (`promise child <- workflow X(args)`). Maps to `ChildWorkflowFuture.SignalChildWorkflow`. Everything needed to type-check the send — the target workflow definition and its declared signals — is reachable from names already in the file.

**External addressing is deferred to the backlog.** Signalling a workflow you did *not* start (entity workflows by business ID, sharded siblings, cross-saga peers) maps to `workflow.SignalExternalWorkflow`. The *syntax* for it is clear (`signal external X(id).Name(args)`); the blocker is that the DSL has **no mechanism to identify a workflow by runtime identity**. The address is a workflow-ID value (`orderId`, `"order-" + id`), and the DSL deliberately has no expression/ID-addressing primitive — the same gap that deferred the `workflow_id` call option. External sends are unblocked the moment that identity mechanism exists; until then, fusing an opaque ID expression into the send statement would smuggle in the deferred problem without the deliberation that deferred it. See `BACKLOG.md` → `External-Addressed Signal Sends`.

The handle-bound form composes with the existing `AsyncTarget` machinery, so it gets all three forms (statement, await target, promise target). Note the await/promise forms wait on **send acceptance** (the SDK future resolves when the server accepts the send / the child has started), *not* on the receiving handler executing — see Group 1 for the precise wording.

## Design decisions locked in

These are the calls this REVISIONS file makes. Each is overridable; flag any disagreements now since downstream propagation depends on them.

| # | Decision | Rationale |
|---|---|---|
| D1 | Keep the `signal` keyword overload | Already overloaded (declaration vs await target); a third meaning disambiguated by syntactic form (dot-qualified target + arg list). Note this overload is sharper than `workflow`/`activity`/`nexus` (which split across *positions* — top-level def vs body call): the send target shares the `await signal …` position with the arrival target and differs only by the embedded `.`. Accepted, but the spec must make the disambiguation explicit. Alternative `send signal` was rejected as verbose. |
| D2 | Require dot-qualified target for sends | `signal handle.Name(args)` reads as "send to handle's Name handler." The leading dot-form is the syntactic tell that disambiguates from arrival targets (`await signal Name`) with one-token lookahead. |
| D3 | Handle binding via existing `promise` | `promise child <- workflow X(args)` already produces a workflow handle (a `ChildWorkflowFuture`). Reuse it instead of inventing new handle syntax. Resolver verifies the promise is workflow-bound (its `Target` is a `WorkflowTarget`). This widens what a promise *is* — it can now be used as a handle (`signal p.X()`) in addition to an awaitable (`await p`) — which the spec should name explicitly. |
| ~~D4~~ | ~~New `external` keyword for ID-addressed sends~~ | **Deferred to backlog.** External addressing needs a workflow-identity mechanism the DSL does not have. With external sends out of scope, this cycle adds **no new keyword**. (When external sends return, prefer a *soft* keyword special only after `signal` — matching the `service`/`endpoint` precedent — rather than a hard keyword that steals a common identifier.) |
| ~~D5~~ | ~~`signal external` is implicitly same-namespace~~ | **Deferred with D4.** Reasoning preserved in `BACKLOG.md`: cross-namespace is a Nexus concern. (Note: this was a policy choice, not an SDK limit — Go's `WithWorkflowNamespace` does allow cross-namespace external signals.) |
| D6 | DSL is silent on cross-workflow update-send and query-send | No syntax, no spec mention, no skill mention. Grounded in SDK reality: in-workflow cross-workflow query/update is genuinely unsupported (Java docs are explicit; the standard workaround is an activity that uses the client). The grammar leaves the `update handle.X(args) -> r` and `query handle.X() -> r` slots available by absence — the DSL just doesn't claim them. |
| D7 | Args remain opaque strings | Consistent with all existing call sites (`ActivityCall.Args`, `WorkflowCall.Args`, `SignalDecl.Params`). No new resolver work beyond name checks. (D7 is unproblematic for handle-bound sends — args are "the meat." It was the *external* form, where the opaque value would be the addressing ID, that raised the concern; that concern moves to the backlog with external addressing.) |

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

**Change type:** `External` (additive; new AST node type and JSON output fields. No existing grammar breaks. **No new keyword token** — `signal` is already lexed.)

**Parallelism:** Self-contained. The `send_target` non-terminal is deliberately left open so external addressing can slot a second alternative in later (see backlog) without reworking the statement/target shape.

**Specific changes:**

1. **New statement form** in `06-statement-syntax.md`:

   ```
   signal_send_stmt ::= 'signal' send_target args NEWLINE

   send_target ::= ident_handle_target
                 # external_handle_target is a deferred second alternative
                 # (see BACKLOG.md → External-Addressed Signal Sends)

   ident_handle_target ::= IDENT '.' IDENT
                          # IDENT 1 = promise bound to a workflow call
                          # IDENT 2 = signal handler name on the target workflow
   ```

   Disambiguation from a signal *arrival* target is one-token lookahead: after `signal IDENT`, a `.` means a send; anything else is arrival. The parser adds `token.SIGNAL` to `workflowStmtParsers` for the statement form and branches the existing `signal` arm of the shared async-target parser for the await/promise forms.

2. **New async-target form** (composes with `await` and `promise`):

   ```
   signal_send_target ::= 'signal' send_target args
   ```

   Extends the `await_target` and `async_target` unions in `06-statement-syntax.md` and `12-grammar-summary.md`. Behavior:

   - As statement: `signal child.PaymentReceived(amount)` — fire-and-forget. No result binding.
   - As await: `await signal child.PaymentReceived(amount)` — block until the **send is accepted** (for a child, until the child has started). Signals carry no return value, and this does **not** wait for the receiver's handler to run.
   - As promise: `promise sent <- signal child.PaymentReceived(amount)` — capture the send-acceptance future; `await sent` later.

   **Wording matters here.** The SDK future for a signal send resolves on *send acceptance*, never on handler execution (Go: the call "returns when the server accepts the Signal; it does not wait for the Signal to be delivered"; `SignalChildWorkflow` "blocks until child workflow is started"). The spec and skill text must not describe `await`/`promise` on a send as "delivery acknowledged" or imply the receiver processed it. Because that distinction is subtle and the statement form covers the overwhelming majority of real use, downstream propagation may choose to ship the statement form first and the await/promise forms only when a concrete need appears.

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

## Group 2: External-addressed signal sends — DEFERRED

**Status: moved to `BACKLOG.md` → `External-Addressed Signal Sends`.** Not part of this cycle.

External addressing (signalling a workflow the sender did not start, by runtime identity) maps to `workflow.SignalExternalWorkflow`. The *syntax* is settled — `signal external X(id).Name(args)` — but it cannot ship until the DSL has a way to identify a workflow by runtime ID, which it currently does not. The full reasoning, the settled syntax, and the blocker are recorded in the backlog so this can resume without re-deriving the design. The one-line summary:

- **Blocker:** no workflow-identity mechanism. The target address is a workflow-ID *value*, and the DSL has no expression/ID-addressing primitive (the same gap that deferred the `workflow_id` call option — see `BACKLOG.md` → `Workflow ID Call Option`). Both should likely be unblocked by the same future primitive.
- **When unblocked:** add a second `send_target` alternative (`external_handle_target`), prefer a *soft* keyword for `external` (special only after `signal`, matching `service`/`endpoint`), and treat the target run as the latest by default (run-pinned addressing stays deferred). The "X declares signal N" check is a DSL-imposed design-time contract, stricter than Go's untyped `SignalExternalWorkflow` — frame it as such, not as SDK-enforced.

---

## Group 3: Spec reorganization — "Cross-Workflow Signals" section

**Findings:**

- Signal handler and arrival material is scattered: handler declarations in `01-workflows.md`, await/promise/case targets in `06-statement-syntax.md`, context restrictions in `10-context-restrictions.md`. A reader looking for "how does workflow A signal workflow B?" has to read all three to discover the answer used to be "you can't."
- After Group 1 lands, the asymmetry that produced this REVISIONS will be gone for the handle-bound case, but the spec navigation problem will remain unless the cross-workflow signal material is grouped in one place.
- Existing sections are organized by syntactic shape (definitions, statements, expressions). The new section should be organized by *concept* (cross-workflow signals) and cross-reference the syntactic sections. Same pattern as Temporal's own docs.

**Files touched:**
- `tools/spec/sections/` (new file, `13-cross-workflow-signals.md`)
- `tools/spec/sections/00-overview.md` (add to the See list)
- `tools/spec/sections/01-workflows.md` (cross-reference from Signal Declarations section)

**Change type:** `Internal` (pure reorganization; no grammar changes).

**Parallelism:** Should ship *with* or *after* Group 1 — writing it before the grammar is locked invites rework. Independent of the actual implementation work in that group.

**Specific changes:**

1. **New section file** `13-cross-workflow-signals.md` with the following structure:

   ```
   # Cross-Workflow Signals

   Mechanisms by which one workflow signals another while both are running.

   ## Overview

   | Form | Addressing | Resolution |
   |---|---|---|
   | signal handle.Name(args) | Workflow promise (`promise h <- workflow X(args)`) | Resolver checks handle is workflow-typed and target workflow declares `signal Name`. |

   ## Composition with await and promise

   Signal-send produces a send-acceptance future. Use as a statement to fire-and-forget; use with `await` to block until the send is accepted (for a child, until it has started); bind with `promise` to compose later. None of these wait for the receiving handler to run — signals carry no return value.

   ... examples ...
   ```

   The section documents only what the DSL provides. It does not enumerate what the DSL doesn't provide (no "external addressing not supported," "queries not supported," or "updates not supported" callouts) — the spec stays silent on absent capabilities, consistent with how it treats every other unimplemented Temporal feature.

2. **In `01-workflows.md`**, add a one-line pointer at the end of "Signal Declarations": *"For sending signals to other workflows, see [Cross-Workflow Signals](./13-cross-workflow-signals.md)."*

3. **In `00-overview.md`**, add the new file to the See list.

---

## Group 4: Keyword inventory note

**Findings:**

- This cycle adds **no new keyword** — `signal` is already lexed. (The `external` keyword is deferred with external addressing; see backlog.)
- The `signal` keyword now has three uses (handler declaration, arrival target, send statement/target). Worth a short note in the keyword reference so first-time readers know to disambiguate by syntactic form, not by keyword.

**Files touched:**
- `tools/spec/sections/08-tokens-and-keywords.md`

**Change type:** `Internal` (keyword inventory note; the grammar change lives in Group 1).

**Parallelism:** Trivial; combine with Group 1.

**Specific changes:**

1. Update the `signal` keyword entry to note the three uses:

   ```
   - `signal` - Three uses: (a) handler declaration at the top of a workflow, (b) arrival target in await/promise/await-one (`await signal Name`), (c) send statement/target with a dot-qualified handle target (`signal handle.Name(args)`). Disambiguated by syntactic context — specifically, a `.` after the name marks a send rather than an arrival.
   ```

---

## Internal design notes (not a spec change)

These items shape the grammar but are deliberately *not* mentioned in the spec or downstream skills. They exist here as a record for future contributors so the same design questions don't get re-asked.

- **External addressing.** Deferred — see Group 2 and `BACKLOG.md` → `External-Addressed Signal Sends`. The blocker is the absence of a workflow-identity mechanism, not the syntax. The `send_target` non-terminal is left open so the external alternative slots in without reworking Group 1.
- **Cross-workflow update-send.** Not modeled. The Go SDK currently has no `workflow.UpdateChildWorkflow` / `workflow.UpdateExternalWorkflow`; the recommended workaround is an Activity that uses the client. The grammar designed in Group 1 leaves the `update handle.X(args) -> r` slot available by absence — if direct support is ever added, syntax slots in without retrofitting. The spec and skill stay silent on this.
- **Cross-workflow query-send.** Not modeled. Queries are a client-side primitive (`Client.QueryWorkflow`); the Go SDK has no workflow-level equivalent, and the Java docs explicitly state querying a child from within workflow code is unsupported. The grammar leaves the `query handle.X() -> r` slot available by absence. Same silence in spec and skill.
- **Signal-with-Start.** `Client.SignalWithStartWorkflow` is client-only; there is no child-workflow equivalent that atomically starts-and-signals (confirmed by Temporal maintainers). The in-workflow path is `ExecuteChildWorkflow` then signal the handle (Group 1), or — once external addressing lands — `SignalExternalWorkflow`. No fused primitive added.
- **Cross-namespace signal.** Deferred with external addressing. Cross-namespace messaging is treated as a Nexus concern; note this is a *policy* choice, not an SDK limit (Go's `WithWorkflowNamespace` does allow it). Captured in `BACKLOG.md` under Nexus Extensions → `Cross-Namespace Messaging via Nexus`.
- **Cancellation send.** Not in scope. Lives in BACKLOG (under `Cross-Workflow Update / Query Sends`, paired paragraph). The send-side grammar in Group 1 is structurally similar to what a future `cancel handle` would need, so the eventual cancel-send REVISIONS can reuse the same machinery.

---

## Downstream propagation

This REVISIONS file is the DSL contract. After it is consumed and renamed, `/project:propagate-changes` should produce downstream REVISIONS in:

- **`internal/changes/parser/`** — implement the AST addition (`SignalSendStmt` + a handle-bound `SignalSendTarget` as a new `AsyncTarget`), parser productions (statement form via `workflowStmtParsers[token.SIGNAL]`; await/promise forms by branching the shared `signal` async-target arm on one-token lookahead for `.`), resolver rules (handle resolves to a workflow-bound promise; target workflow declares the signal), graph package additions (new `signalSend` edge kind). **No lexer change** — no new keyword.
- **`internal/changes/visualizer/`** — render the new `signalSend` edge kind; unblock "Message Flow Edges" and "Handler Show Callers" from `visualizer/BACKLOG.md`; add the new edge type to the unified filter bar / type toggles.
- **`internal/changes/design-skill/`** — extend `skills/design/topics/signals-queries-updates.md` with a "Sending Signals to a Child Workflow" section describing the handle-bound model and the composition forms, with the send-acceptance (not handler-execution) semantics stated explicitly.
- **`internal/changes/author-go-skill/`** — new `skills/author-go/reference/signal-send.md` mapping the handle-bound forms (statement/await/promise) to `ChildWorkflowFuture.SignalChildWorkflow`; update `workflow-call.md` (line ~31, "communication is through signals only") with a forward reference.

## Recommended execution order

1. **Confirm D1, D2, D3, D6, D7** above (D4/D5 are deferred). Default: ship as proposed.
2. **Group 1** — handle-bound signal sends. One parser pass. Consider shipping the statement form first and deferring the await/promise composition forms until a concrete need appears (the send-acceptance semantics are subtle).
3. **Group 3 + Group 4** — spec reorganization and the keyword note. Pure documentation; ship in the same commit as Group 1 or follow once the grammar is stable.
