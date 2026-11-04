# TWF Language Changelog

> This changelog resumes at v0.11.0 after a gap: the v0.9.x and v0.10.x releases
> (published, but never captured here) are not documented. The v0.11.0 entry covers
> everything since v0.10.2.

## v0.16.0 - Modules, ID Conflict Policies, Worker Families & Nexus Access

Packages move into modules: a `twf.mod` gives every package an import path,
and an import reaches only the package with exactly its path. `.twf` also moves
closer to what Temporal accepts at runtime. A workflow start now
knows whether it is a child or a client start and takes the matching ID
policies. A `{param}` in a worker task queue declares a per-instance worker
family. Nexus endpoints gain a caller allowlist. Routing and coherence checks
are scoped to the namespace. Several changes reject designs that used to check
clean; each is marked below.

### ⚠️ Breaking: packages live in modules (`twf.mod`)

Every file with a `package` clause now needs a `twf.mod` above it, which
declares the module path of the design below it:

```
module github.com/acme/shop   # twf.mod, at the design's root
```

A package is **one directory** of a module, and its **import path** is the
module path plus that directory: `orders/` is `github.com/acme/shop/orders`.
A packaged file with no `twf.mod` above it is `PACKAGE_OUTSIDE_MODULE` and is
ignored. Clause-less designs are unaffected and need no `twf.mod`.

- `twf mod init <module path>` writes the file. The path is required; with no
  argument it fails and suggests one (from the enclosing module, the design's
  own imports, or the Git remote). The editor offers the same as a quick fix.
- The `package` clause is one identifier and must be the file's first clause.
  It must equal the import path's last element, with a trailing `/vN`
  dropped (`…/orders/v1` → `package orders`), or `PACKAGE_NAME_MISMATCH`.
- One directory holds one package. New errors, each reported once with the
  offending files ignored: `MODULE_FILE_INVALID`, `PACKAGE_OUTSIDE_MODULE`,
  `DUPLICATE_MODULE`, `PACKAGE_CLAUSE_CONFLICT`, `INVALID_PACKAGE_PATH`,
  `DUPLICATE_PACKAGE`; `MODULE_FILE_UNKNOWN_DIRECTIVE` is a warning.

### ⚠️ Breaking: imports resolve by exact path

An import now reaches only the package with **exactly** its path — never a
same-named package elsewhere (#232). Two packages named `fabric` at different
paths are two packages; alias one to import both. New errors:
`INVALID_IMPORT_PATH`, `SELF_IMPORT`, `IMPORT_NEEDS_ALIAS`,
`DUPLICATE_IMPORT_NAME`, and `IMPORT_NOT_FOUND` for a typo under your own
module (it used to be a silent external). `IMPORT_NOT_LOADED` warns when a
package is on disk but not among the inputs. A path under no module in the run
is still `UNRESOLVED_IMPORT`, treated as external.

### ⚠️ Breaking: wire output

- **Node ids carry the package's import path**:
  `workflow:example.com/demo/fabric/v1.Setup/worker:w/namespace:ns` (was
  `workflow:fabric.Setup/…`). AST `qualifiedName` follows. Unpackaged ids are
  unchanged. Treat ids as opaque beyond the kind.
- New fields: graph nodes `name` and `packageId`; a `packages` table
  (identity → declared name) on graph, chunks, parse and symbols output; AST
  definitions `packageId`; symbols `packageId` and `sourceFile`; decompose
  nodes `label` and `packageId`, chunks `label` and `baseKey`, sections
  `label`, `labelKind` and `subjects`; graph diagnostics `file`. Decompose
  `nodes[].name` is now the bare name (`Work`, was `app.Work`); `key` keeps
  the qualified form.
- Diagnostics' `file` and definitions' `sourceFile` are the path as the input
  named the file (`designs/agent/v1/agent.twf`), not its base name. A file
  named twice is read once; directory walks skip `.*`, `_*`, `testdata` and
  symlinks. Diagnostics are sorted.

### Migration

1. Move each package into its own directory, named so that the module path
   plus the directory is the import path its importers write.
2. At the design's root, run `twf mod init <module path>` (run it with no
   argument for a suggestion) and commit the `twf.mod`.
3. Run `twf check .` and fix `PACKAGE_NAME_MISMATCH` and `IMPORT_NOT_FOUND`.
4. Consumers of the JSON: read `name`, `packageId` and `packages` instead of
   parsing ids, and match `sourceFile` as a path.

### ⚠️ Breaking: `TERMINATE_IF_RUNNING` removed; `workflow_id_conflict_policy` and start kinds

```twf
workflow Cart(id: string):
    id_scheme: "cart-{id}"
    default_options:
        workflow_id_reuse_policy: ALLOW_DUPLICATE
        workflow_id_conflict_policy: TERMINATE_EXISTING  # was TERMINATE_IF_RUNNING
    close complete(id)

nexus service Carts:
    async Open workflow Cart                    # client start: uses the defaults
    sync Touch(id: string) -> (string):
        workflow Cart(id)
            options:
                workflow_id_conflict_policy: USE_EXISTING  # client start: may override
        close complete(id)

workflow Shop(id: string):
    workflow Cart(id)
        options:
            parent_close_policy: ABANDON        # child start: takes no conflict policy
    close complete(id)
```

- `workflow_id_reuse_policy: TERMINATE_IF_RUNNING` (deprecated in Temporal) is
  no longer a value. Write `ALLOW_DUPLICATE` with
  `workflow_id_conflict_policy: TERMINATE_EXISTING`.
- New `workflow_id_conflict_policy` (`FAIL`, `USE_EXISTING`,
  `TERMINATE_EXISTING`), valid in a workflow's `default_options:` and at a
  client start.
- **Start kinds.** A start in a workflow body or signal/update handler is a
  **child start** and takes `parent_close_policy`. A start in a sync Nexus body,
  or an `async Op workflow Name` run operation, is a **client start** and takes
  `workflow_id_conflict_policy` (a run operation from the workflow's
  `default_options:`). A key the start cannot carry is `OPTION_MISPLACED`. That
  newly rejects `parent_close_policy` in a sync Nexus body; in
  `default_options:` it is now `OPTION_MISPLACED` instead of `SYNTAX`, and
  `workflow_id:` there is now `ID_AT_START`.
- New diagnostics: `ID_POLICY_INCOMPATIBLE` (error: a client start would send
  `TERMINATE_EXISTING` with `REJECT_DUPLICATE`, which Temporal server 1.27+
  rejects), `ID_POLICY_WITHOUT_ID_SCHEME` (hint), `CHILD_START_CONFLICT_MISMATCH`
  (hint), and `NEXUS_RUN_WITHOUT_ID_SCHEME` (warning: an `async` Nexus
  operation's backing workflow has no `id_scheme:`, but a retried run operation
  needs a deterministic ID).

### ⚠️ Breaking (wire): workflow start `mode` and `start`

`workflowCall` statements and workflow async targets gain
`start: "child" | "client"`. `mode` now says only whether the caller holds the
start: `"attached" | "detach"` (was `"child" | "detach"`). Wire types add
`WorkflowStartKind`; the visualizer badges client starts.

### ⚠️ Breaking: per-instance worker families; name parameters leave task queues

```twf
workflow RunTask(task: Task, lease: Lease) -> (Output):
    activity RunTool(task.call) -> output
        options:
            task_queue: "sandbox-{lease.sandboxId}"   # matches the family by shape
            schedule_to_start_timeout: 30s
    close complete(output)

namespace aivearium:
    worker sidecar
        options:
            task_queue: "sandbox-{sandboxId}"         # one worker per sandbox
```

- A `{param}` in a worker instantiation's `task_queue` is an **instance
  parameter**: one worker per value, each polling its own queue. It is local to
  that instantiation and never bound. Two queues match on identical spelling,
  or on the same fixed text with parameters in the same positions; names are
  ignored, and a call-site parameter is a path into the caller's data. A
  call-site queue that is a single parameter (`"{lease.queue}"`) matches any
  family.
- Name parameters (`{org}` in `tenant-{org}`) no longer reach option strings,
  and `UNBOUND_TEMPLATE_PARAM` is removed. A `"q-{org}"` queue under
  `tenant-{org}` still checks, but is now a family; drop the parameter for the
  static queue you meant. `worker_identity` is free text.
- An endpoint `task_queue` must be static (`ENDPOINT_TASK_QUEUE_TEMPLATED`).
  The v0.11 pattern of a templated worker *and* endpoint queue under a
  templated namespace no longer checks; make both static (`"bootstrap"`).
- A malformed family queue is `QUEUE_TEMPLATE_MALFORMED`: a brace group that is
  not a name, touching parameters (`"q-{a}{b}"`), a stray brace, a reserved
  prefix, or over 1000 bytes.
- Hazard hints: `TASK_QUEUE_OVERLAP`, `INSTANCE_QUEUE_NO_START_TIMEOUT`,
  `INSTANCE_FAMILY_HOSTS_WORKFLOW`, `INSTANCE_FAMILY_VERSIONED`; and the warning
  `INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE` (no endpoint can reach a family).
- Wire: namespace worker instantiations and worker graph nodes carry
  `templateParams`.

### ⚠️ Breaking: Nexus service coherence; caller allowlists

```twf
namespace payments:
    nexus endpoint PaymentsEndpoint
        options:
            task_queue: "payments"
            allowed_caller_namespaces: ["shop", "tenant-{org}"]
```

- **Breaking:** task-queue coherence also compares Nexus service sets, among
  the workers on a queue that register any; a difference is
  `TASK_QUEUE_MISMATCH`.
- **New, opt-in:** `allowed_caller_namespaces` models Temporal Cloud's endpoint
  access policy. A call originating in an unlisted namespace is
  `NEXUS_CALLER_NOT_ALLOWED`; the endpoint's own namespace is not implicit.
  Absent means no policy; `[]` allows no caller. Entries are `.twf` namespace
  names, matched by spelling.
- A worker registers whole services: `nexus service Svc.Op` in a worker is
  `WORKER_REGISTERS_OPERATION` (was `QUALIFIED_REF_WITHOUT_IMPORT`, or a syntax
  error that dropped the worker).

### ⚠️ Breaking: duplicate option keys and worker type names

- `DUPLICATE_OPTION_KEY`: a key repeated in one options block, nested blocks
  included, reported at the second occurrence.
- `WORKER_DUPLICATE_TYPE_NAME`: a worker registers one name twice for a kind,
  either by repeating an entry or with same-named types from different packages
  (`workflow a.Run` + `workflow b.Run`). Temporal registers by name, and the Go
  SDK panics on the second registration.

### ⚠️ Breaking: string escapes

A string literal accepts `\"` and `\\`, inside call arguments too. A string
literal's value is unescaped (`"a\\b"` is `a\b`); argument text stays as
written. Any other backslash escape
(`"\n"`, `"\d"`), accepted before, is now a `parse/LEX` error, which
`twf check --lenient` does not excuse (#106).

### ⚠️ Breaking: routing is namespace-scoped

A task queue belongs to its namespace, so routing and endpoint linkage now
match on (namespace, task queue). A queue name shared by two namespaces no
longer makes an unreachable target look reachable.

- Namespace identity is the deploy name: coherence groups by it, so two
  packages declaring `namespace prod` share its queues.
- A call is routing-checked against its target's `default_options:`
  `task_queue` when the call site sets none.
- `promise`/`await`/`await one` targets are routing-checked; external and
  undefined targets, and callers hosted nowhere, are not.
- Routing diagnostics, including the graph's
  `DISPATCH_NO_REACHABLE_DEPLOYMENT`, name the namespace.

### ⚠️ Breaking: lexical promise scope

A promise is in scope from its binding to the end of its block, nested blocks
included, in a workflow body, handler or sync Nexus body. A later binding
shadows it; same-named promises in sibling blocks are distinct; a handler sees
its workflow body's top-level promises. Before, only promises bound at the top
level of a workflow body resolved, but anywhere in it. A use before the binding
is now `UNDEFINED_PROMISE_OR_CONDITION`, and a handler's send to a body promise
is now checked against the target's signals.

### Other language & tooling changes

- **Wire:** workflow, activity and nexus-service definitions gain an optional
  `qualifiedName` (`pkg.Name`), the name in their graph node ID; join graph
  nodes to definitions on it. Omitted for unpackaged definitions. Go API:
  `graph.QualifiedName` moved to `ast.QualifiedName`.
- **Diagnostics:** in multi-file checks, validator errors name the reference
  site's file rather than the callee's; `TASK_QUEUE_IDENTICAL` and
  `TASK_QUEUE_MISMATCH` now carry a position; option value errors point at the
  value.
- **Visualizer:** worker families get a cardinality badge; packaged definitions
  get file chips; "Show in Tree" / "Show in Graph" resolve a node to its owning
  definition by qualified name, including nexus operation and endpoint nodes.

### Fixes

- `twf check` no longer hangs on a top-level `nexus` call; it reports one
  `parse/SYNTAX` error (#263).
- A trailing `# comment` on a line that opens a block (a call followed by
  `options:`, a definition header, `nexus endpoint Ep`) no longer breaks the
  parse. A trailing comment on a block header is discarded; elsewhere it stays a
  comment statement (#275).
- An undefined workflow, activity, signal or update used as a `promise` /
  `await` target is reported at its keyword, not at 0:0 (#276).
- Resolver and validator diagnostics come out sorted by file, position, then
  code, so the same input gives the same output on every run (#237).
- Graph dispatch uses the target's `default_options:` `task_queue` when the
  call site sets none, as routing checks already did. `routing.explicit` carries
  that queue. This removes a spurious `DISPATCH_NO_REACHABLE_DEPLOYMENT` and
  draws the missing dispatch edge (#245).
- A worker instantiated twice in one namespace emits each of its containment
  edges once (#264).
- **LSP:** rename, references and go-to-definition ranges cover the name, not
  the statement keyword, so a rename no longer overwrites `workflow` or
  `signal`, and renaming a Nexus endpoint edits the endpoint on a `nexus` call.
  Go-to-definition and hover work on a signal send's type head (#225).
- **Visualizer:** "Show in Tree" on a nexus operation or endpoint scrolls to and
  flashes that row, not just the service or namespace that owns it (#249).
- **Visualizer:** a row the Tree scrolls to ("Show in Tree", in-tree navigation,
  arrow keys) lands below the sticky filter bar, not under it. A repeat "Show in
  Tree" on the same row scrolls to it again and restarts its flash (#293).
- **Visualizer graph view:** wheel zoom no longer logs a passive-listener
  warning per event, and the page behind the canvas no longer scrolls (#212).
  When the pane resizes, for example when a host opens a side panel, the camera
  keeps the point at the pane's centre in place (#210).
- **Design skill:** `common-errors.md` covers the lexer's `LEX` errors
  (unterminated string, unterminated argument list, inconsistent indentation,
  unknown escape) (#105).

## v0.15.0 - Workflow ID Schemes & Addressed Signal Sends

A workflow type can declare how its ID is built, and a signal can reach a
workflow the sender did not start by naming its type and an address. Comments
are now allowed inside options blocks, and the visualizer's graph view moves to
a new force-directed engine.

### New: `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
    id_scheme: "ship-{order.id}-{item.id}"
    ...
```

`id_scheme:` is the first line of a workflow body. Each hole is a path rooted
in one of the workflow's params; a scheme with no holes is a singleton. Starts
never write an ID: it derives from their args, so `id:` under a start or
`workflow_id:` in its options is `ID_AT_START`.

### New: type-headed signal sends

A send's head is now a workflow type or a handle. A type head takes an
indented address; a handle takes none.

```twf
workflow RelayCarrierEvent(event: CarrierEvent):
    signal ShipItem.Shipped(event.tracking)
        id: "ship-{event.orderId}-{event.sku}"   # constructed: mirrors the scheme
    signal ShipItem.Shipped(event.tracking)
        id: wid                                  # learned: one name holding the ID
        run_id: rid                              # optional
    ...

workflow Packer(order: Order):
    signal Fulfillment.PackDone(order.id)
        id: parent                               # the parent execution
    ...
```

A type head may be package-qualified (`signal orders.ShipItem.Shipped(t)`) and
maps to `SignalExternalWorkflow`. A send may now be the first statement of a
workflow body. Fourteen new diagnostics (`ID_SCHEME_*`, `ID_MIRROR_MISMATCH`,
`TYPE_NEEDS_ID`, `NOT_A_PARENT`, …) are tabled in spec §11, and every resolved
type-head send draws a `signalSend` edge.

### ⚠️ Breaking: `id_scheme` keyword and reserved `parent`

`id_scheme` is a hard keyword. `parent` is reserved: a param, binding, promise
or condition named `parent` is `RESERVED_NAME`.

### ⚠️ Breaking (wire): signal-send `head`

`SignalSendStmt.handle` becomes
`head {kind, type, package, handle, address, external}`. `WorkflowDef` gains
`idScheme`, `Unresolved` gains `reason: "external"` for a target behind an
import of a package outside the tree, and diagnostics gain a `hint` severity.

### Other language & tooling changes

- **Parser fix:** a comment anywhere in an options block (between keys, after a
  value, in a nested block) no longer fails with
  `expected option key, got COMMENT`.
- **Visualizer:** the graph view is rebuilt on a force-directed engine
  (`tools/graph-view`, bundled into `@temporal-architect/visualizer`); signal
  sends draw as their own edge style.

## v0.14.0 - Visualizer Host Shell & Served Decomposition

No language, CLI or wire changes. Library additions for hosts that embed the
visualizer:

- **`@temporal-architect/visualizer`:** exports a reusable `<VisualizerHost>`
  shell with `PayloadSource` / `HostActions` seams and a framework-free message
  protocol (`HostMessage`, `OutboundMessageType`). A new outbound
  `requestDecomposition(params)` action lets the Groups panel ask the host to
  recompute chunks.
- **Go `tools/lsp/pipeline`:** `BuildDecompose(paths, opts)` returns the graph
  and its decomposition overlay together in a `Payload`.

## v0.13.0 - Versioned Imports, Diagnostic Attribution & `go install`

Versioned imports resolve, diagnostics land on the referencing file, and `twf`
installs with `go install`.

### ⚠️ Breaking: versioned import paths resolve

```twf
import "github.com/acme/shop/orders/v1"              # referenced as orders.X
import billingv2 "github.com/acme/shop/billing/v2"   # alias renames locally only
```

An import's leaf name drops a trailing `/vN` segment (Go's rule), so
`.../orders/v1` targets package `orders` rather than a nonexistent `v1`.
Aliased versioned imports were silently treated as external, which skipped
checking, and bare ones failed with `QUALIFIED_REF_WITHOUT_IMPORT`. References
through them now resolve, and typos behind them now error. The
`UNRESOLVED_IMPORT` message names both the path and the derived leaf.

### Other language & tooling changes

- **Diagnostics:** resolve errors are attributed to the referencing file in
  both `twf check` and the LSP, not to a file that defines the referenced name;
  import warnings gain their filename.
- **CLI:** `go install github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf@vX.Y.Z`
  works, and `twf version` reports the module version. Each release also tags
  `tools/spec/vX.Y.Z` and `tools/lsp/vX.Y.Z`.
- **Go API:** the parse → graph pipeline is importable as
  `tools/lsp/pipeline` (`Build`, `ParseFiles`, the diagnostic model). JSON
  output is unchanged.

## v0.12.0 - Canonical Subagent Definitions

No language, CLI or wire changes. The design skill's project-discovery and
slice-mapper subagents move to canonical files under
`skills/temporal-architect-design/subagents/`, which the distribution's Claude
Code plugin compiles verbatim.

## v0.11.0 - Packages, Imports & Parameterized Namespaces

The largest language batch since worker blocks. Multi-file systems get real
package boundaries and imports; deployment names gain per-tenant templating;
definitions carry their own default options; and option values accept list
literals. Includes one breaking removal — see below.

### ⚠️ Breaking: `cron_schedule` removed

The `cron_schedule` workflow option is gone. Recurring execution is a
runtime/deployment concern (a Schedule), not a `.twf` deployment-topology fact,
so it no longer belongs in the language. Files that still set `cron_schedule`
will not parse — remove it and drive recurrence from a Temporal Schedule.

### New: packages & imports (multi-file systems)

A file declares its package; cross-package references are qualified by the
imported package's leaf name and require an `import`. Nexus endpoints stay
**flat-global and are never package-qualified**.

```twf
package orders

import "github.com/acme/shop/payments"

workflow Checkout(order):
    # same-package service, referenced bare; cross-package one, qualified
    nexus Gateway OrderService.PlaceOrder(order) -> placed
    nexus Gateway payments.PaymentService.Charge(order) -> receipt
    close complete(placed)
```

An import that isn't present in the workspace resolves as **external** and emits
only an `UNRESOLVED_IMPORT` warning — never an `UNDEFINED` error. Graph identity
is package-aware, the validator is package-aware, and the LSP resolves imports
across the workspace.

### New: definition-level `default_options`

An activity or workflow definition can carry a `default_options:` block; call
sites inherit it and may override **per key**. Overriding a nested block
(e.g. `retry_policy`) is an **atomic replace**, not a deep merge.

```twf
activity ChargeCard(card: Card, amount: int) -> (Receipt):
    default_options:
        start_to_close_timeout: 30s
        retry_policy:
            maximum_attempts: 5
    return charge(card, amount)

workflow FulfillOrder(order: Order) -> (OrderResult):
    default_options:               # first body element, before `state:`
        workflow_execution_timeout: 1h
    ...
    activity ChargeCard(order.tip) -> tipReceipt
        options:
            retry_policy:          # atomic-replaces the default retry_policy
                maximum_attempts: 1
```

### New: parameterized per-tenant namespaces & endpoints

Deployment names (namespace, nexus endpoint) accept inline `{param}` template
holes, so a per-tenant/per-org/per-shard **family** is one declaration instead
of one namespace apiece. Identity is the whole assembled name string, matched by
spelling (token equality) — not runtime substitution.

```twf
namespace fabric-shard-{org}:
    nexus endpoint fabric-shard-{org}-BootstrapShard
```

An endpoint's `{param}` set must be a **superset** of its namespace's, or the
flat-global name would collide across the family (`ENDPOINT_PARAM_NOT_SUPERSET`);
a `{param}` used but never bound raises `UNBOUND_TEMPLATE_PARAM`. The visualizer
collapses a family to a representative node with a `× org` cardinality badge.

### New: list literals in option values

Option values accept list literals, e.g. non-retryable error types:

```twf
retry_policy:
    non_retryable_error_types: ["InvalidInput", "NotFound", "Unauthorized"]
```

### Other language & tooling changes

- **Shared-worker joint ownership** via a `topology-owner` convention, so a worker
  hosted from multiple files has one unambiguous topology owner.
- **Parser fix:** a `(` inside a string literal no longer silently truncates the
  rest of the file.
- Clearer diagnostic for **body-less definitions**; `task_queue` is now a
  first-class field on the nexus-endpoint AST node.
- Docs: the **Nexus opt-out** annotation is documented in the author-go
  proto-driven Rosetta stone.

## v0.8.0 - Cross-Workflow Signals

New construct for the *send* side of signals: a workflow can signal a child it started and still holds a handle to. The feature is deliberately minimal — **handle-bound only** (no external/ID addressing) and **statement-only** (no `await`/`promise`/`await one` form).

### New syntax: `signal handle.Name(args)`

```twf
workflow OrderSaga(order: Order) -> (SagaResult):
    promise pay <- workflow ProcessPayment(order)
    promise ship <- workflow ShipOrder(order)

    # Notify the payment workflow that the order has shipped
    signal pay.OrderShipped(shipmentId)

    await all:
        await pay -> payment
        await ship -> shipment
    close complete(SagaResult{payment, shipment})
```

The handle is a workflow-bound promise (`promise handle <- workflow X(args)`); the dot-qualified name selects a signal the target workflow declares. Maps to `ChildWorkflowFuture.SignalChildWorkflow`.

### Fire-and-forget semantics

Signal send is a statement only. A signal carries no return value, so there is nothing to bind, and the only thing a sender could wait on is *send acceptance* — never the receiver's handler running. The DSL keeps signal send to the single fire-and-forget statement form to avoid the misreading "the target processed my signal."

A workflow-bound promise serves two roles on the same handle: an awaitable (`await pay -> payment`) and a signal target (`signal pay.OrderShipped(...)`). Sending a signal does not consume or affect a later `await`.

### Grammar

- `signal_send_stmt ::= 'signal' send_target args NEWLINE`, `send_target ::= ident_handle_target`, `ident_handle_target ::= IDENT '.' IDENT`
- Added to the workflow statement set (not the activity set); mirrored in the grammar summary. Not an `await`/`async` target.
- **No new keyword** — the third use of `signal`; a `.` after the name disambiguates a send from a signal arrival.

### Resolver & validation

- The handle must resolve to a workflow-bound `promise`, and the target workflow must declare the named signal.
- Two new errors: handle-not-workflow-typed; signal-name-not-declared-by-target.
- Context restrictions match a `workflow` call: valid in a workflow body, signal handler, update handler, or sync nexus operation body; rejected in an activity body or query handler.

### AST & graph

- New `SignalSendStmt` statement node (statement-only; not an `AsyncTarget`).
- New distinct `signalSend` graph edge (fire-and-forget, no result), keyed on the resolved handle — its own filterable category, not a reuse of the call edge. A workflow-bound promise used only as a signal target is not flagged "result never consumed."

### Deferred

- External-addressed sends (`signal external X(id).Name(args)`) are scoped out, blocked on a workflow-identity mechanism. Tracked as [#10](https://github.com/jmbarzee/temporal-architect/issues/10).

---

## v0.7.0 - Full Nexus Support

**Breaking change** — The old `nexus "namespace" workflow Name(args)` syntax is replaced with a structured nexus model.

### What changed

Nexus is now a first-class concept with service definitions, endpoint instantiations, and typed operation calls.

### New constructs

- **Nexus service definitions** (top-level): `nexus service Name:` with `async` and `sync` operations
- **Nexus endpoint instantiations** (in namespace blocks): `nexus endpoint Name` with `task_queue` routing
- **Nexus service references** (in worker blocks): `nexus service Name`
- **Nexus call syntax** (in workflow bodies): `nexus Endpoint Service.Operation(args) -> result`
- **New tokens**: `sync`, `async`, `.` (dot)

### Before (v0.6.0)

```twf
workflow Caller(order: Order) -> (Result):
    nexus "payments" workflow ProcessPayment(order.payment) -> result
    detach nexus "notifications" workflow SendEmail(order.email)
```

### After (v0.7.0)

```twf
nexus service PaymentsService:
    async ProcessPayment workflow ProcessPaymentWorkflow

workflow Caller(order: Order) -> (Result):
    nexus PaymentsEndpoint PaymentsService.ProcessPayment(order.payment) -> result
    detach nexus NotificationsEndpoint NotificationsService.SendEmail(order.email)

worker orderWorker:
    workflow Caller
    nexus service PaymentsService

namespace orders:
    worker orderWorker
        options:
            task_queue: "orders"
    nexus endpoint PaymentsEndpoint
        options:
            task_queue: "payments"
```

### Resolver additions

10 new error types and 3 new warning types for comprehensive nexus validation including duplicate service/endpoint checks, endpoint-service linkage, and external reference warnings.

---

## v0.6.0 - Namespace Blocks & Worker Refactor

**Breaking change** — Workers are now reusable type sets. Deployment configuration (namespace, task_queue) has been moved to namespace blocks.

### What changed

Workers no longer contain `namespace` or `task_queue` entries. Instead, workers are pure type sets (workflows + activities), and a new `namespace` top-level definition instantiates workers with deployment options.

### Before (v0.5.0)

```twf
worker orderWorker:
    namespace orders
    task_queue orderProcessing
    workflow ProcessOrder
    activity ChargePayment
```

### After (v0.6.0)

```twf
worker orderWorker:
    workflow ProcessOrder
    activity ChargePayment

namespace orders:
    worker orderWorker
        options:
            task_queue: "orderProcessing"
```

### Benefits

- **Reusable type sets** — Same worker definition can be instantiated in multiple namespaces (e.g., production vs staging)
- **Richer deployment config** — Worker instantiation options include concurrency limits, rate limits, and other Temporal worker settings
- **Clearer separation** — Type grouping (worker) is separate from deployment topology (namespace)

### AST

- `WorkerDef` no longer has `Namespace` or `TaskQueue` fields — only `Name`, `Workflows`, and `Activities`
- New `NamespaceDef` node with `Name` and `Workers` (list of `NamespaceWorker`)
- `NamespaceWorker` has `WorkerName` and optional `Options` block
- JSON output: `workerDef` no longer includes `namespace`/`taskQueue`; new `namespaceDef` type added

### Resolver validation

- Worker type set refs to undefined workflows/activities produce errors
- Namespace refs to undefined workers produce errors
- Worker instantiation missing `task_queue` option produces error
- Workers on same task queue with different type sets produce errors
- Workers not instantiated in any namespace produce warnings
- Workflows/activities not on any instantiated worker produce warnings

### Worker instantiation options

Worker options (all snake_case): `task_queue`, `worker_activity_rate_limit`, `task_queue_activity_rate_limit`, `worker_local_activity_rate_limit`, `max_concurrent_activity_executions`, `max_concurrent_workflow_task_executions`, `max_concurrent_local_activity_executions`, `max_concurrent_workflow_task_pollers`, `max_concurrent_activity_task_pollers`, `max_cached_workflows`, `sticky_schedule_to_start_timeout`, `heartbeat_throttle_interval`, `worker_identity`, `worker_shutdown_timeout`, `local_activity_only_mode`

### Semantic tokens

- `namespace` keyword now colored as `type` (same as `workflow`/`activity`/`worker`) instead of `property`
- Namespace name colored as `function` with declaration modifier (same as worker/workflow/activity names)

---

## v0.5.0 - Worker Blocks

New top-level `worker` definition that connects workflows and activities to a task queue and namespace, enabling deployment topology validation at design time.

### New syntax: `worker`

```twf
worker orderWorker:
    namespace orders
    task_queue orderProcessing
    workflow ProcessOrder
    workflow CancelOrder
    activity ChargePayment
    activity SendNotification
```

### New tokens

- `worker` — top-level definition keyword
- `namespace` — worker namespace declaration
- `task_queue` — worker task queue declaration

### AST

- New `WorkerDef` and `WorkerRef` AST nodes
- `WorkerDef` includes `Name`, `Namespace`, `TaskQueue`, `Workflows`, and `Activities` fields
- JSON output uses type `"workerDef"` with `workflows` and `activities` arrays

### Resolver validation

- Worker references to undefined workflows/activities produce errors
- Duplicate worker names produce errors
- Defined workflows/activities not registered on any worker produce warnings
- Workers on the same task queue with different type sets produce errors
- Workers on the same task queue with identical type sets produce warnings (redundant)

### Semantic tokens

- `worker` keyword colored as `type` (same as `workflow`/`activity`)
- `namespace` and `task_queue` keywords colored as `property` (muted, like `options`)
- Worker name after `worker` keyword colored as `function` with declaration modifier
- Namespace/queue values colored as `variable`

### Options parser fix

The `task_queue` keyword is now accepted as a valid option key in `options:` blocks (previously it tokenized as IDENT, now it tokenizes as TASK_QUEUE).

---

## v0.4.0 - Options Restricted to Calls Only

**Breaking change** — options blocks are no longer allowed on activity or workflow definitions. Options are now only valid on call sites (`activity Name(args)` and `workflow Name(args)` statements).

### What changed

- `Options` field removed from `WorkflowDef` and `ActivityDef` AST nodes
- Parser no longer accepts `options:` blocks inside definition bodies
- Options remain fully supported on `ActivityCall` and `WorkflowCall` nodes (suffix-style, indented after the call)

### Why

Temporal SDK patterns always apply options at the call site. Definition-level defaults added language complexity without matching real API usage — the caller always controls timeouts, retry policies, and task queue routing.

### Migration

Move any definition-level `options:` blocks to the call sites. For example:

```twf
# Before (no longer valid)
activity Foo(x: int) -> (Result):
    options:
        start_to_close_timeout: 10s
    return x

# After
workflow Bar():
    activity Foo(x) -> result
        options:
            start_to_close_timeout: 10s
```

### Visualizer impact

- JSON output for `workflowDef` and `activityDef` nodes no longer includes `"options"` field
- `activityCall` and `workflowCall` JSON nodes still include `"options"` when present
- No changes to options block structure or schema validation

---

## v0.3.0 - Structured Options Blocks

**Breaking change** - replaces the old `options(key: value, ...)` parenthesized syntax.

### New syntax: `options:`

Options are now indentation-based blocks with one key-value pair per line. Nested blocks (e.g. `retry_policy:`) use indentation without braces.

```twf
activity ChargePayment(order) -> payment
    options:
        task_queue: "payment-workers"
        start_to_close_timeout: 60s
        retry_policy:
            maximum_attempts: 3
            initial_interval: 1s
            backoff_coefficient: 2.0
```

### Key naming

All option keys use `snake_case`, matching the Temporal proto field names directly.

### Schema validation

Option keys are validated per context — activity calls and workflow calls each have a defined set of allowed keys. Unrecognized keys produce parse errors. Values are type-checked against expected types (string, duration, number, bool/enum).

**Activity options:** `task_queue`, `schedule_to_close_timeout`, `schedule_to_start_timeout`, `start_to_close_timeout`, `heartbeat_timeout`, `request_eager_execution`, `retry_policy`, `priority`

**Workflow options:** `task_queue`, `workflow_execution_timeout`, `workflow_run_timeout`, `workflow_task_timeout`, `parent_close_policy`, `workflow_id_reuse_policy`, `cron_schedule`, `retry_policy`, `priority`

**Retry policy (nested):** `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types`

### New value literals

- **Duration** - `30s`, `5m`, `1h`, `500ms`, `2d` (numeric value with time suffix)
- **Number** - `3`, `2.0` (integer or float)
- **Enum** - validated identifiers like `TERMINATE`, `ABANDON`, `REQUEST_CANCEL`

Duration and number literals are recognized inside `options:` blocks.

### Coloring

Options render with reduced visual prominence compared to execution logic:
- `options` keyword, option keys, and enum values to `property` (muted)
- Duration and number values to `number`
