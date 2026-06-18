# DSL Backlog

Unimplemented features and design ideas. Not committed to any cycle — just a place to drop thoughts.

---

## Statement Recognition

### Meaningful Statements Hidden in `raw` (leading priority)

A bare statement like `x = ActName(args)` parses as `raw` pseudocode text, not as a structured `activityCall`/`workflowCall`. The call exists in the author's intent but never appears in the AST — so a real, used activity looks uncalled, every downstream consumer (validator, graph, visualizer) misses the edge, and `twf check` reports clean. This was the leading silent-failure in `REFLECTION_DESIGN.md` (8 activities with no structured call site).

```twf
# Parses as raw text today — the call to ProcessData is invisible:
workflow Pipeline(input: Input) -> (Result):
    x = ProcessData(input)        # intended: activity ProcessData
    close complete(Result{x})
```

**The fix (be thoughtful about which raw statements we promote/flag):** when a raw statement appears in an **orchestration context** (a workflow body, not a free-form activity body) and its call target **resolves to a defined `activity`/`workflow`/`nexus` symbol**, it is almost certainly a miswritten structured call. Lean toward **diagnosing** ("`x = ProcessData(args)` looks like a call to activity `ProcessData` — use `activity ProcessData(args) -> x`") rather than silently reinterpreting, because a bare `x = F(args)` drops the `activity`/`workflow`/`nexus` keyword that encodes *which* Temporal primitive it is — the parser can't safely guess.

**Scope boundary:** activity bodies are intentionally free-form pseudocode (`x = transform(y)` is just code there). The disambiguation must key on *context + symbol resolution*, never promote raw statements blanket-style.

**Related:** Consider whether to make a binding call form first-class (`result = activity Foo(args)` / `x = activity Foo(args)`) so the natural assignment syntax is legal-and-structured instead of swallowed as raw.

**Open questions:** Diagnose-only, or offer an auto-fix? Does a resolvable raw call in a workflow body become a hard error, a warning, or a structured node? Should the binding call form be added? What about raw statements whose target is *not yet defined* (typo) — those fall to the unused-definition check (see `internal/changes/parser/BACKLOG.md`) as a backstop.

---

## Packages and Project Structure

### Packages / Cross-Package References

No `import`/`extern`/`package` construct: a `.twf` cannot reference a definition in another `.twf`
except by passing all files to `twf check` together (the "defined somewhere in this file set"
behavior). The reverse-engineering reflection hit this hard — per-package files forced reproducing
cross-domain activity/workflow/nexus stubs locally just to resolve.

```twf
# wanted: reference a definition that lives in another package/file
import "payments/payments.twf"        # or: extern activity ChargePayment(...)
```

**Current interim (design-skill guidance):** put **all `.twf` in one package** so everything
resolves together — deliberately routing *around* the missing feature. Cost: `.twf` layout decouples
from code layout (see Reference Annotations for the mapping).

**Why deferred:** one-package resolution covers the present need. Real packages become valuable only
when teams want per-package co-location (a `.twf` beside the code it describes) without losing
resolution. Pairs with the cross-domain stub convention the design skill documents as the interim.

**Open questions:** `import` (file-level) vs `extern` (per-symbol forward declaration) vs a `package`
header? How does this interact with the nexus external-reference marker (same "lives elsewhere"
intent — see Nexus Extensions)? Does the graph/visualizer span packages? Pairs with the inbound edge
under *Connecting In and Out of Temporal* below (the outbound "declared elsewhere" half).

---

## Connecting In and Out of Temporal (System Boundary)

TWF models the system *inside* Temporal — workflows, activities, workers, namespaces, Nexus — but
represents the **boundary** between that system and the outside world only implicitly. Two edges of
that boundary are invisible to tooling today:

- **Inbound — what triggers the system.** Workflows started by an external client, a schedule, an
  operator, or a Nexus operation are the *roots* of the design. The DSL has no way to mark them, so
  tooling cannot tell a legitimate top-level workflow from leftover/dead code and cannot compute
  reachability at all (a graph walk needs roots). Signal/update/query handlers and
  Nexus-operation-backing workflows are entered out-of-band too — they are roots even though nothing
  in the file calls them.
- **Outbound — what the system reaches that lives elsewhere.** Definitions in another package, Nexus
  services/endpoints owned by another team/namespace, and external systems an activity talks to are
  "declared elsewhere." Today their absence is *inferred* (blanket per-category strictness for Nexus;
  one-package resolution for cross-file refs), which produces the wrong errors (see the outbound items
  cross-referenced below).

**Direction:** treat this as **one concept** — *a way to declare how the design connects in and out of
Temporal* — rather than a grab-bag of point markers. The inbound edge gives tooling its reachability
**roots**; the outbound edge gives it "lives elsewhere" **leaves**; together they define the boundary
the harness cuts along when decomposing a design into composable chunks.

**This subsumes the former standalone "Entry Point Annotation" item** (the inbound half). The original
sketch was a single `@entry` annotation:

```twf
@entry
workflow Comparanda(config: Config) -> (Result):
    ...
```

but the narrow marker is being reframed: the real need is to express the *boundary*, not just tag a
root. Whatever inbound surface lands (annotation `@entry`, keyword `entry workflow Foo`, or a form that
also names the *trigger* — client/schedule/operator/Nexus) should be designed alongside the outbound
"declared elsewhere" mechanism, not as an isolated annotation.

**Leading motivation (from `REFLECTION_DESIGN.md`):** In the Comparanda design, `Comparanda` was the
real top-level entry, but the validator had no way to tell it apart from leftover workflows — so
neither dead-code detection nor "is everything reachable" could be offered. The current `checkCoverage`
validator pass only checks *worker-registration* coverage (and only when namespaces are declared); it
does not check whether a definition is ever *called* or *reachable*.

**Outbound half — already tracked elsewhere, folded in here:**
- **Packages / Cross-Package References** (above) — the general `import`/`extern`/`package` "declared
  elsewhere" mechanism.
- **External Nexus Reference Marker (`extern`)** (Nexus Extensions) — carries the S2 steer to *not*
  ship a nexus-specific marker but ride the general mechanism.
- **Reference Annotations (`@ref`)** (Annotations) — links a definition to where its real
  implementation lives (a third "elsewhere" axis: code location).

**Tooling payoff (parser):** reachability checks and composable-chunk / workflow-tree identification
both need roots; see `parser/BACKLOG.md` → *Reachability Check* and *Graph Decomposition*. Until the
inbound boundary lands, those fall back to heuristic roots (handler-bearing + Nexus-op-backing
workflows) plus graph traversal of connected components — workable for the basic case, weaker for
loops and oversized trees.

**Open questions:** Inbound surface — annotation (`@entry`) vs keyword (`entry workflow Foo`) vs a
trigger-naming form (client/schedule/operator/Nexus)? Are handler-bearing and Nexus-op-backing
workflows *implicit* inbound roots, or must they be marked? Is reachability opt-in once any inbound
marker exists (zero markers = a library, no warnings)? Do the inbound marker and the outbound
"declared elsewhere" mechanism share grammar, or are they distinct constructs designed together?

---

## Naming Conventions

### UpperCamelCase for All Top-Level Primitives

Worker type set names and namespace names currently use lowerCamelCase, while workflows/activities use UpperCamelCase. All top-level definitions should consistently use UpperCamelCase.

```twf
# Current:
worker orderTypes:
namespace orders:

# Proposed:
worker OrderTypes:
namespace Orders:
```

**Why deferred:** Requires updating all existing examples, test data, topic files, and the spec. Should be done as a standalone cleanup.

---

## Nexus Extensions

### List Workflows in Sync Operations

Sync nexus operation handlers can list/query workflows as part of their implementation. No current syntax for representing a "list workflows" primitive in the DSL.

```twf
nexus service OrderService:
    sync ListActiveOrders(filter: Filter) -> (OrderList):
        list ProcessOrder(filter) -> orders
        close complete(orders)
```

**Open questions:** What does the syntax look like? `list WorkflowType(filter)` as a primitive? How does it relate to Temporal's visibility/list APIs? Is this a workflow-body primitive or nexus-operation-only?

### Cross-Namespace Messaging via Nexus

Cross-namespace state changes today route through a sync nexus operation whose body bridges into the target namespace (e.g. a sync operation whose body signals or starts a workflow). The DSL does **not** add a `namespace:` option to `signal external` (per `REVISIONS_001` D5) and is intended to keep it that way — cross-namespace is a Nexus concern, not a direct signal-send concern. Adding a `namespace:` option on `signal external` would invite the wrong pattern, since the SDK's `WithWorkflowNamespace` plus `SignalExternalWorkflow` does technically work but lacks the typed-operation, endpoint-routing, and contract surface that Nexus provides.

**Possible future shapes** (not committed):

- An explicit "signal a workflow in another namespace via Nexus" primitive (`nexus EndpointName.SignalRelay(...)` where the operation's body signals a target workflow). This is already expressible with the current sync-nexus-operation grammar — just convention, no new syntax.
- First-class typed "signal channel" Nexus operations if a future SDK adds a Nexus operation kind for signal delivery.

**Open question:** Is there an idiom worth blessing in the design skill — "to signal across namespaces, define a sync nexus operation that signals the target locally"? If yes, this becomes a skill addition, not a grammar one.

### External Nexus Reference Marker (`extern`)

Today nexus references resolve via a **blanket per-category cliff**: if *any* `nexus service` is
defined in the file set, *every* service reference must resolve locally (`NEXUS_UNDEFINED_SERVICE`,
error); otherwise they are warnings ("may be external"). Endpoints follow the same rule on their own
axis. This conflates "I provide some services" with "all services are local."

**Why this is wrong (SDK-grounded):** a codebase is routinely **both** a caller of external services
(other namespaces/teams, reached via an out-of-band Registry endpoint) **and** a provider of its
own. The moment it defines one local service, every genuinely-external reference turns into a hard
error. This bit the reverse-engineering work, where a single domain's `.twf` is simultaneously caller
and provider.

```twf
# wanted: declare a reference as intentionally external, so local definitions
# don't flip it to an error
extern nexus service Payments
extern nexus endpoint PayEndpoint
```

**Direction:** an explicit `extern` marker (soft keyword, matching the `external`/`service`/
`endpoint` precedent) declares external intent, so the resolver stops *inferring* "external" from
"is it defined anywhere." Resolver half tracked in `parser/BACKLOG.md`. Likely shares machinery with
Packages / Cross-Package References (same "lives elsewhere" intent).

**Steer (S2 — do NOT ship a nexus-specific `extern` as the cliff fix):** the real need is the
*general* "declared elsewhere" mechanism — a C-header-like "this thing exists somewhere else."
Solve it once under **Packages / Cross-Package References** and let nexus references ride it, rather
than minting a bespoke nexus keyword. Once a general header/import exists, the cliff largely
dissolves: you declare what lives elsewhere, and an unmarked-unresolved reference stays a warning.
Keep this entry as the *general* header/`extern` concept (it has standalone value, like C headers),
de-scoped from a nexus-only marker.

### Nexus Endpoint Access Policy (allowed caller namespaces)

A Nexus endpoint carries a **runtime access policy** — the allowlist of caller namespaces permitted
to invoke it (`No callers allowed by default`). The Terraform provider models this as
`allowed_caller_namespaces` on `temporalcloud_nexus_endpoint`; `tcld`/CLI uses `--allow-namespace`.
TWF models the endpoint (name, target namespace, task queue) but **not who may call it** — yet that
is design-relevant security/topology intent, and the `author-infra` skill needs it to provision the
endpoint completely.

```twf
# Illustrative only — syntax TBD
namespace payments:
    nexus endpoint PayEndpoint:
        task_queue: "payments"
        allow_callers: [orders, billing]      # caller-namespace allowlist
```

**Why needed:** without it, the design can't express the caller→endpoint authorization boundary, so
the infra author has to source it from outside the `.twf`. It's also a reachability/where-used signal
(which namespaces are sanctioned callers).

**Surfaced by:** the `author-infra` skill scoping (Temporal Cloud Terraform `allowed_caller_namespaces`
/ `tcld --allow-namespace`).

**Open questions:** Where does the allowlist live — on the endpoint declaration (as sketched) or a
separate policy block? Namespaces only, or also service accounts? How does it interact with the
caller-side `nexus ... call` (cross-check that a caller's namespace is on the allowlist)? Self-hosted
(custom Authorizers) vs Cloud RBAC differences.

### Custom Search Attributes

Custom search attributes are namespace-level configuration registered **out-of-band** (Terraform
`temporalcloud_namespace_search_attribute`, `tcld`/CLI, or the operator API) and then set/read by
workflows for visibility/filtering. TWF models neither the *declaration* (namespace owns attributes
X: Keyword, Y: Int) nor their *use* (a workflow setting/upserting a search attribute).

```twf
# Illustrative only — syntax TBD
namespace orders:
    search_attributes:
        OrderStatus: keyword
        OrderTotal: double
```

**Why borderline (design vs ops):** the *declaration* is namespace setup the `author-infra` skill
must provision (design-relevant — it's part of the namespace contract). The *upsert-at-runtime* side
(a workflow writing its own search attributes) is closer to workflow behavior and may warrant a
separate call-site primitive. Lower priority than access policy.

**Surfaced by:** the `author-infra` skill scoping (search attributes are out-of-band infra).

**Open questions:** Declaration only (namespace-level), or also a workflow-body `upsert_search_attributes`
primitive? Fixed type enum (`keyword`/`text`/`int`/`double`/`bool`/`datetime`/`keyword_list`)? Does the
resolver cross-check that attributes used in workflows are declared on the namespace?

**Open questions:** `extern nexus service X` declaration vs a per-call modifier? Does this subsume
cross-package import for nexus? **Lean:** once `extern` exists, an unmarked-but-unresolved reference
should *stay a warning* (preserve partial-file friendliness for reverse-engineering) rather than
becoming a hard error — `extern` is an opt-in precision tool, not a mandate.

---

## Workflow Semantics

### External-Addressed Signal Sends

Sending a signal to a workflow the sender did **not** start — addressed by runtime identity rather than by a handle in scope. Maps to `workflow.SignalExternalWorkflow` (Go) / `getExternalWorkflowHandle` (TS) / `newExternalWorkflowStub` (Java). Scoped *out* of `REVISIONS_001`, which ships only the handle-bound case (`signal handle.Name(args)`). This entry captures the deferred work so it can resume without re-deriving the design.

**The syntax is settled, the blocker is identity.** The intended surface is:

```twf
signal external WorkflowType(idExpr).SignalName(args)
```

where `WorkflowType` is a type anchor (so the resolver can check the target declares `signal SignalName`) and `idExpr` is the runtime workflow ID. The design review found the syntax clear and the SDK alignment exact. The **only** blocker is that the DSL has *no mechanism to identify a workflow by runtime identity*: the address is a workflow-ID value (`orderId`, `"order-" + id`), and the DSL deliberately has no expression / ID-addressing primitive in statement position.

**Why this is the same blocker as `Workflow ID Call Option`.** Both need a way to express a workflow ID as a value — a plain string, an in-scope identifier, or a composed/interpolated expression. The `value` grammar today is `STRING | DURATION | NUMBER | IDENT` with no expression support. Whatever primitive unblocks `workflow_id` (see [Workflow ID Call Option](#workflow-id-call-option)) almost certainly unblocks this. They should likely be designed together. Fusing an opaque ID expression into `signal external` ahead of that design would smuggle the deferred expression problem in through the back door — the address is the single most correctness-critical value in the statement, and rendering it as opaque text means the design tool can neither show nor check it.

**What we learned (lessons to preserve for the resuming REVISIONS):**

- **SDK alignment is exact.** External addressing is universal across SDKs (Go/TS/Java/.NET/Ruby). Go addresses purely by `(workflowID, runID, signalName string)` with no type; TS/Java bind a type via the stub. The `WorkflowType(id)` surface synthesizes both — type anchor for checking, ID for addressing — and is *stricter* than Go. Frame the "target declares `signal N`" check as a **DSL design-time contract**, not an SDK-enforced rule.
- **Prefer a soft keyword.** When `external` returns, make it a **soft keyword** special only after `signal` (matching the `service`/`endpoint` precedent), not a hard keyword. `external` is a common word likely to appear in raw pseudocode; a hard keyword steals it globally for no benefit.
- **`runId` addressing stays deferred.** Most external signals target a stable business ID, not a specific run; default to the latest run. Add the optional run-pinned form only if a real need appears.
- **Existence is not checkable.** TS and Java both note the external handle does *not* verify the target exists — the *signal call* fails, not the handle creation. So if `WorkflowType` doesn't resolve to a local definition, warn rather than error (the target may live outside the current `.twf` set), consistent with the unresolved-nexus-endpoint convention.
- **Send-acceptance, not handler execution.** As with handle-bound sends, the SDK future resolves on *send acceptance*, never on the receiver's handler running. Any `await`/`promise` composition must be documented as such.
- **Grammar slot is reserved.** `REVISIONS_001` defines `send_target` with a single `ident_handle_target` alternative and explicitly leaves room for `external_handle_target` as a second alternative — so this slots in without reworking the handle-bound form.

**Cross-namespace** stays a Nexus concern (see Nexus Extensions → `Cross-Namespace Messaging via Nexus`). Note this is a *policy* choice, not an SDK limit — Go's `WithWorkflowNamespace` does allow cross-namespace external signals; we steer to Nexus for its typed-operation and routing surface.

### Cross-Workflow Update / Query Sends

Workflow-to-workflow send for updates and queries. Handle-bound signal-send ships via `REVISIONS_001`; external-addressed signal-send is deferred (see [External-Addressed Signal Sends](#external-addressed-signal-sends)). The update/query slots remain absent from the DSL grammar — `update handle.X(args) -> r` and `query handle.X() -> r` are syntactic shapes the spec does not claim, leaving them available if direct support is ever added downstream.

**Current SDK reality:** The Temporal Go SDK has no `workflow.UpdateChildWorkflow` / `workflow.UpdateExternalWorkflow` or workflow-context query equivalent. Cross-workflow updates/queries today require an Activity that uses the client — that bridge is the standard pattern. A direct DSL surface would compile to "this needs an activity bridge" in author-go today; if and when SDK semantics change, the grammar slot is unclaimed and ready.

**Why not just add it now:** The spec stays silent on capabilities the underlying primitives don't provide — adding `update handle.X(args) -> r` syntax that lowers to an activity bridge would invite designers to reach for it without recognizing the boundary they're crossing (extra activity surface, retries on the bridge itself, etc.). Until SDK semantics make the direct path real, the activity bridge stays explicit in the design.

**Reachability nuance (from `REFLECTION_DESIGN.md`):** Signal/query/update handlers — and workflows started out-of-band (external clients, schedules, Nexus operations) — look like dead code to any reachability / unused-definition check, because their trigger is invisible to the DSL. Send-side syntax for signals (shipped via `REVISIONS_001`) makes *intra-design* signal sends visible as dependency edges (so a signal handler targeted by another workflow in the same design is no longer "uncalled"), but query/update handlers and *external* triggers still will not be. Any reachability checker must therefore treat handler-bearing and entry-annotated workflows (see Connecting In and Out of Temporal) as roots rather than flagging them as unreachable.

**Cancellation send (separate but related):** The same send-side gap applies to **cancelling** another workflow — a parent cancelling a runaway child, or pausing across a Nexus boundary. In the Comparanda design `AgenticTask.Cancel` and `Pause/Resume` can only be triggered by an external client as drawn, because a workflow has no way to *send* a cancel/pause. A cancel-send primitive (`cancel handle` / `cancel external X(id)`) is a candidate for a follow-up REVISIONS that would reuse the same send-target machinery shipped by `REVISIONS_001`. This is distinct from the *receive* side (see Workflow Cancellation Handler).

---

### Workflow Cancellation Handler

`await one:` documents auto-cancellation of race losers, but there's no way to express what happens when an *entire workflow* is cancelled externally.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    on_cancel:
        activity RefundPayment(order)
        activity NotifyCustomer(order, "cancelled")

    activity ChargePayment(order) -> payment
    activity FulfillOrder(order) -> fulfillment
    close Result{payment, fulfillment}
```

**Why needed:** Cancellation is a first-class Temporal concept. Cleanup/compensation on cancel is a common pattern with no current TWF representation.

**Scope — this is the *receive* side.** This item is the handler: what a workflow does when it is cancelled (`on_cancel:`). The *send* side — one workflow cancelling/pausing another — is a separate item, paired with Signal/Query/Update Send Statements above. Keep them distinct.

### Async Activity Completion

Activity that starts, then completes from an external system (human approval, webhook callback). Referenced in activities-advanced.md topic but no language syntax.

```twf
activity RequestApproval(order: Order) -> (Approval):
    async_complete
    send_approval_request(order)
```

**Why needed:** Common pattern for human-in-the-loop workflows. `heartbeat` has syntax; `async_complete` does not.

### Explicit Type Definitions

Types are bare identifiers — no `type Foo: ...` struct syntax. Type structure only exists in implementation code.

```twf
# Can't do this:
type OrderResult:
    status: string
    total: decimal
    items: Item[]

# Must do this:
workflow ProcessOrder(order: Order) -> (OrderResult):
    # OrderResult structure lives in implementation
```

**Impact:** No single source of truth for data structures at design time. Can't validate field names/types.

**Trade-off:** Adding types moves the DSL toward a full IDL. May conflict with "skeleton, not meat" principle — or may be exactly what's needed for design clarity.

### Update Validators

Pre-persistence read-only check on an update handler that can reject the request before it's added to workflow history. Maps to `workflow.SetUpdateHandlerWithOptions{Validator: ...}` in the Go SDK and is a first-class concept across all SDKs. Validators must be deterministic, side-effect-free, and may observe (but not mutate) workflow state.

```twf
# Illustrative only — syntax TBD
update ChangePlan(newPlan: string) -> (ChangeResult):
    validator:
        if (not contains(allowedPlans, newPlan)):
            reject "unsupported plan"
    plan = newPlan
    return ChangeResult{success: true, plan: plan}
```

**Why needed:** The validator is the *only* primitive in Temporal that gives you "reject this update before it touches the workflow." Today the only TWF workaround is an `if` at the top of the update body — but by then the update is already in history, which is exactly what the validator avoids. Without it, designs can't express "this update is gated by a precondition I want enforced server-side, not after persistence."

**Why deferred — predicated on `state:` evolution:** Validators are a read-only check over workflow state, and the current `state:` block is condition-flags-only (`condition isReady`). Without richer assertion/observation primitives in `state:`, a validator body has nothing meaningful to read except local condition flags. Reconsider once the `state:` block grows assertion or typed-state surface that makes validators *useful*; the syntax sketch above is parking it for later.

**Open questions:** Sub-block on the `update` decl (as sketched), or a separate `validate Name(...)` decl paired by name? New `reject "msg"` keyword, or reuse `return` / `close fail`? What's the statement set inside the validator — the activity-restricted set (no temporal primitives, no state mutation, same as query handlers), or something tighter still?

### Workflow ID Call Option

`workflow_id` as a workflow call option for specifying deterministic workflow IDs at call sites. This is a core Temporal SDK pattern (e.g., deriving a child workflow ID from a business entity) but is not currently in the allowed workflow call options.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    workflow ShipOrder(order) -> shipment
        options:
            workflow_id: "ship-order-" + order.id
            parent_close_policy: TERMINATE

    # Idempotent fan-out via deterministic IDs
    for (item in order.items):
        workflow ProcessItem(item)
            options:
                workflow_id: "process-item-" + item.id
                workflow_id_reuse_policy: ALLOW_DUPLICATE_FAILED_ONLY
```

**Why deferred:** The concept is already used in topic docs (child-workflows.md shows `workflow_id` in options blocks), but the allowed workflow call options list does not include it. Adding it requires deciding whether the value is a plain string, a template expression (`"order-{order.id}"`), or a concatenation expression (`"order-" + order.id`) — which ties into the broader question of expression syntax in option values. The current `value` grammar (`STRING | DURATION | NUMBER | IDENT`) has no expression support.

**Open questions:** Should `workflow_id` values support string interpolation, concatenation expressions, or just static strings? Should `workflow_id_reuse_policy` also be added? How does this interact with the resolver — should it warn on non-unique IDs inside loops?

---

## Workflow Metadata and Tools

Stable, general-purpose facilities that any workflow can ask of itself or the runtime — things that read like methods or members of a workflow, not domain-specific application logic. Bundles features that don't belong in handler declarations, call sites, or deployment topology, but are nonetheless first-class workflow capabilities the DSL doesn't currently express.

### Workflow Metadata Intrinsics

Deterministic SDK utilities like `workflow.history_length()` / `workflow.history_size()` have no formal syntax. Currently shown as raw expressions in examples.

```twf
# Used in practice but not formalized:
historyBytes = sdk.HistorySize()
if (historyBytes > 40_000_000):
    continue_as_new(data)
```

**Why this matters (from `REFLECTION_DESIGN.md`):** The "should this loop `continue_as_new`?" decision essentially reduces to *the DSL has no way to read workflow metadata (history length/size, iteration count, run age) and branch on it*. Without intrinsics for that metadata, a design can express `close continue_as_new(...)` but cannot express the **condition** that should trigger it — so the continue-as-new *strategy* stays implicit, which is exactly the silent gap the reflection flagged on `AgenticTask`. Formalizing a small set of read-only, deterministic workflow-metadata intrinsics would let designs express *selective* continue-as-new control flow rather than leaving the trigger to prose or to the author skill.

**Candidate intrinsics** (illustrative — exact set TBD): `workflow.history_size()`, `workflow.history_length()`, `workflow.id`, `workflow.run_id`, `workflow.namespace`, `workflow.task_queue`, `workflow.attempt`, `workflow.start_time`. Update-context intrinsics: `update.id` for handler-side dedup across continue-as-new (see "Ensuring your messages are processed exactly once" in the Temporal docs).

**Open questions:** Should the DSL formalize a set of SDK intrinsics (history size/length, run count, info)? A namespaced `sdk.*` / `workflow.*` form, or first-class keywords? Which are deterministic-and-safe to expose vs implementation details that belong in `raw_stmt`? How does this interact with expression-based conditions (above)?

### All-Handlers-Finished Await Condition

Temporal's encyclopedia documents a standard pattern: before `close complete` or `close continue_as_new`, wait for all in-flight signal/update handlers to drain. Otherwise update callers receive `NotFound` errors, and signals fired right before completion are lost. The runtime exposes this as a workflow-level wait condition (every SDK has a flavor of it).

```twf
# Illustrative only — syntax TBD
workflow OrderEntity(id: string):
    signal AddItem(item: Item):
        items.append(item)

    update Checkout() -> (Receipt):
        return checkout()

    await signal Shutdown
    await all_handlers_finished
    close complete
```

**Why needed:** Without this, a workflow that completes while a handler is still running silently drops the handler's work. The DSL today has no way to express "I am done, but only after every pending handler invocation has returned" — which is exactly the gate the encyclopedia recommends.

**Syntax candidates:**

- **Option A — special await target**: `await all_handlers_finished` (parallels `await timer(d)`).
- **Option B — built-in named condition**: `await __all_handlers_finished` (reuses condition awaiting).
- **Option C — implicit on close**: `close complete` waits by default; opt-out via `close complete abandon_handlers`. Changes existing semantics.

**Open questions:** Which option fits TWF's "skeleton, not meat" principle best? Does this become a built-in condition (paired with a future stdlib of workflow conditions), or stay a one-off keyword? If implicit, what's the migration path for existing designs that already expect `close` to be immediate?

---

## Deployment Topology

### Worker Indirection / Definition Reuse

A worker is currently instantiated by name in at most one namespace block. A reuse extension would let a single worker type set be instantiated in multiple namespaces on different task queues.

```twf
worker paymentWorker:
    activity ChargePayment
    nexus service PaymentService

namespace ecommerce-us:
    worker paymentWorker
        options:
            task_queue: "payments-us"

namespace ecommerce-eu:
    worker paymentWorker
        options:
            task_queue: "payments-eu"
```

**Why deferred:** The two-region case is already expressible by declaring two separate workers with identical bodies. Reuse would be more elegant, but requires the parser/resolver to treat a worker definition as a *template* rather than a deployment, and requires the graph package to enumerate per-namespace worker deployment nodes instead of one node per definition.

**Why needed:** Reduces duplication for multi-region / multi-environment deployments where the same code runs on multiple task queues with different routing.

**Open questions:** Does instantiating the same worker in two namespaces imply two distinct deployments, or one logical worker? Should options blocks per-instantiation override worker-level defaults? How does the graph view distinguish the two deployments visually?

---

### Worker Runtime Options and Versioning / Deployment

The DSL models worker *topology* (which types, which queue, which namespace) but not worker *runtime*
intent: concurrency caps (`MaxConcurrentActivityExecutionSize`,
`MaxConcurrentWorkflowTaskExecutionSize`), activity/task-queue rate limiters, sticky cache, and
**worker versioning / Build IDs / Worker Deployments**.

```twf
# Illustrative only — syntax TBD
worker OrderTypes:
    activity ChargePayment
    options:
        max_concurrent_activities: 200
        versioning: build-id          # or a deployment/version strategy
```

**Why needed (North Star):** these are system-scale concerns — scaling, reliability, availability —
exactly what the design agent should reason about and express, rather than leaving the author skill
to hardcode them in the weeds. Versioning in particular is a determinism/safety concern across
deploys, not an incidental option.

**Surfaced by:** the author-go worker section work, which deliberately scopes worker *wiring* into
the skill but defers *tuning/versioning* here so the skill doesn't cover for a DSL gap.

**Decision (S2 — option set & validation):** TWF worker options are the **union/superset of SDK
worker options**, excluding one-off per-language-only configs. SDK quirks or a missing option in one
SDK do **not** gate inclusion. **Keep it simple for now: the parser accepts all worker options with
no per-language validation** (no language check). Filter by the North Star — express *strategy/intent*
at design altitude (e.g. `versioning: build-id` as a strategy, coarse concurrency intent), not
numeric ops tuning (exact sticky-cache TTLs etc. stay in implementation).

**Open questions:** Worker-level only, or per-namespace deployment? Versioning as an enum of
strategies vs a richer model (Build IDs, Worker Deployments, ramping)? Overlap with
Codec config below (also worker-level) — a shared "worker runtime config" block?

### Codec Server / Payload Codec Configuration

A way to declare that a worker (or namespace) uses a **payload codec / data converter** — the standard mechanism for transparently offloading large payloads (claim-check), compressing, or encrypting them. Today the DSL has no representation of codec configuration at all; large-payload handling is invisible in `.twf`.

```twf
# Illustrative only — syntax TBD
worker ExtractionWorker:
    codec: claim-check        # offload large payloads to external store
    activity RunExtraction
```

**Why needed:** The design skill is being revised to make "defer large payloads to the codec server" the default answer (see `skills/alignment-design_REVISIONS_003.md`). If that's the blessed pattern, the DSL should be able to *say* a codec is in play, so the decision is visible rather than implied.

**Key challenge — codecs are worker-level, calls cross workers.** A payload codec is configured on the **data converter at the worker level**. But a workflow on worker A frequently calls an activity or child workflow that runs on worker B (different task queue, namespace, or across a Nexus boundary). The encoded payload produced under A's codec must be **decodable by B's codec** — if B isn't configured with a compatible codec, it gets an opaque/encrypted blob it can't read. So the hard part isn't representing the codec; it's **validating cross-worker codec compatibility**: every deployment on the receiving end of a dispatch edge must share (or be able to decode) the sender's codec. This is a routing-style check analogous to the existing task-queue routing validation, but over codec configuration rather than queues.

**Open questions:** Codec config at worker level, namespace level, or both? Is it an enum of known strategies (`claim-check`, `compression`, `encryption`) or freeform? Should the resolver/validator check codec compatibility across every dispatch edge (the graph already has the edges)? How does it interact with Nexus, where the target namespace is owned by another team and may have an entirely independent codec? Does this stay design-time intent only, or feed codegen?

## Syntax Extensions

### Bare Promise Declaration

Declare a promise without immediate `<-` binding.

```twf
promise myPromise
# ... later assign it
myPromise <- activity ProcessItem(input)
```

**Why deferred:** No clear use case. `promise p <- ...` covers all known patterns.

### Condition Declarations Outside `state:`

Allow `condition` directly in workflow body without `state:` block.

```twf
workflow Example():
    condition ready
    activity Setup() -> config
    set ready
```

**Why deferred:** `state:` block provides clear separation between declarations and execution. Conditions anywhere complicates parsing and readability.

### Expression-Based Conditions

Arbitrary boolean expressions as await targets, not just named conditions.

```twf
await condition (balance > threshold and not suspended)
```

**Why deferred:** Requires the DSL to understand expression evaluation, conflicting with "skeleton, not meat" principle. Named conditions achieve the same thing with explicit state management.

### SDK Language Specification

Optional declaration of which Temporal SDK language a worker, workflow, activity, or other definition targets.

```twf
# At the worker level — applies to all contained definitions
worker OrderTypes (go):
    workflow ProcessOrder
    activity ChargePayment

# At the individual definition level
workflow ProcessOrder(order: Order) -> (Result) (go):
    activity ChargePayment(order) -> payment
    activity RunFraudModel(order) -> score (python)
    activity NotifyCustomer(order, payment) (typescript)

# At the namespace level
namespace Orders (go):
    workflow ProcessOrder
```

**Why needed:** Polyglot Temporal deployments are common — a Go workflow may call Python ML activities and TypeScript frontend services. Making the SDK language first-class enables design-time intent, code generation targeting the correct SDK, ownership boundaries, and better onboarding context.

**Open questions:** Fixed enum (`go`, `python`, `typescript`, `java`, `dotnet`, `php`) or freeform? Should a parent declaration propagate as a default to children? How does it interact with Nexus boundaries? How does this relate to `@lang` annotations — should both exist, or should one replace the other?

### Local Activity Option

`local: true` option on activity calls to route execution to the local worker, avoiding the task queue round-trip.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    # Local activity: runs in-process on the same worker
    activity ValidateInput(order) -> validated
        options:
            local: true
            start_to_close_timeout: 5s

    # Local activity with retry threshold
    activity EnrichData(validated) -> enriched
        options:
            local: true
            start_to_close_timeout: 10s
            local_retry_threshold: 5s
            retry_policy:
                maximum_attempts: 3
                initial_interval: 100ms

    # Regular activity: goes through task queue as normal
    activity ChargePayment(enriched) -> payment
        options:
            start_to_close_timeout: 60s
```

**Why deferred:** Local activities are an SDK-level execution optimization, not a workflow design concern. TWF's "skeleton, not meat" principle suggests this may be too implementation-specific. However, the choice has design implications — local activities should be short, deterministic, and avoid network calls.

**Open questions:** Boolean option or modifier keyword (`local activity ValidateInput(...)`)? Does `local: true` conflict with an explicit `task_queue` option? Should `local_retry_threshold` and `schedule_to_close_timeout` (which local activities do not support) be validated contextually?

### Non-Retryable Error Types List Syntax

`non_retryable_error_types` is in the grammar spec as a valid retry policy key, but the option value grammar (`value ::= STRING | DURATION | NUMBER | IDENT`) has no list literal type.

```twf
activity ChargePayment(order: Order) -> (Payment):
    options:
        start_to_close_timeout: 60s
        retry_policy:
            maximum_attempts: 5
            initial_interval: 1s
            non_retryable_error_types: ["InvalidInput", "NotFound", "Unauthorized"]
```

**Why deferred:** Adding list literals requires changes across the entire parser pipeline: lexer needs `[` and `]` tokens, AST needs a list value node type, parser needs a list production rule, resolver needs to validate that `non_retryable_error_types` accepts a list of strings.

**Open questions:** General-purpose list syntax (`value ::= ... | list_value`) or restricted to specific option keys? Could an alternative syntax avoid brackets entirely (multi-line list under the key, one entry per line)?

### Dynamic Multi-Await / Async Result Aggregation (umbrella)

General capability: spawn a dynamic (data-driven) set of async operations and **collect their results back into a value** the rest of the workflow can use. Today `await all:` / `await one:` take *static* cases, and a `for (x in xs)` fan-out leaves each `-> result` binding trapped per-iteration — there is no aggregate binding, no accumulate-across-iterations, no dynamic promise set. This umbrella covers the family; the two entries below are specific cuts of it.

```twf
# Wanted: result-bearing fan-out
await all (x in xs):
    workflow F(x) -> r        # collects [r] -> results
```

**Why needed (from `REFLECTION_DESIGN.md` / `twf-language-limitations.md`):** the absence of fan-in is not just missing sugar — it actively invites bugs, because the language gives *no syntactic signal that an `await all` left results unbound*. Two real dropped-result bugs in the Comparanda design (`phase0.twf:39`, `comparanda.twf:114`) trace directly to this. The workaround is to have children write to a blob store and a `Collect*` activity read them back — fan-in done manually and invisibly.

**Lowest-bound win:** even without new aggregation syntax, a resolver **warning** ("`await all` block produces results that are never bound") would have caught both bugs.

**Specific cuts (below):** *Promise Composition* = dynamic promise collection; *Completion-Order Promise Iteration* = yielding results as each completes. This umbrella adds the most basic case: a **static `await all` + `for` with an aggregate result binding**, plus the unbound-results warning.

**Open questions:** One unifying construct or several? `await all (x in xs): … -> results` aggregate-binding form, `await all promises -> results`, and `for await` completion-order — same feature or distinct? Is the unbound-results warning worth shipping ahead of any syntax?

### Promise Composition

Dynamic promise collection for batch awaiting.

```twf
promises = []
for (item in items):
    promise p <- activity Process(item)
    promises.append(p)

await all promises -> results
```

**Why deferred:** `await all:` with inline operations covers most parallel patterns. Dynamic collection adds significant type system and resolver complexity.

### Completion-Order Promise Iteration

Iterate over a set of promises, yielding results in completion order (not declaration order).

```twf
# Spawn N children in parallel
for (entry in manifest.entries):
    promise entry.child <- workflow ProcessComponent(entry.component)

# Process results as each child completes (completion order, not spawn order)
for await (result in manifest.entries):
    activity CommitResult(result)
```

**Why needed:** The `await all:` block is all-or-nothing. Sequential `await p` blocks in declaration order. `await one:` requires static cases and cancels non-winners. There is no construct for "yield the next completion from a dynamic set of pending promises."

**Analogues:** JavaScript `Promise.race` in a shrinking-set loop, Go `select` over channels, Python `asyncio.as_completed()`.

**Open questions:** Iteration target — named collection of promises, or inline declarations? `for await` (new keyword combination) or `await each`? How does the resolver track the shrinking set? What happens if one promise fails?

**Discovered during:** Design of `internal/orchestrator/dev-cycle.twf`.

---

## Annotations

### Language Annotations

Declare what implementation language a workflow, activity, or block should be written in.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    @lang("go")
    activity ChargePayment(order) -> payment

    @lang("python")
    activity RunFraudModel(order) -> score

    @lang("typescript")
    activity NotifyCustomer(order, payment)
```

**Why needed:** Polyglot Temporal deployments are common. Language annotations make this explicit at design time, enabling code generation targeting the correct SDK, clearer ownership boundaries, and better onboarding context.

**Open questions:** Apply at block level or also at file level as a default? Fixed enum or freeform? How does it interact with the SDK Language Specification syntax extension above — should both exist, or should one replace the other?

### Entry Point Annotation

**Moved + reframed.** The inbound-entry-point concept now lives under *Connecting In and Out of
Temporal* (System Boundary), paired with the outbound "declared elsewhere" mechanism rather than
standing alone as a single `@entry` annotation.

### Reference Annotations

Point to where an existing implementation lives in the codebase.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    @ref("order-service/workflows/process_order.go:17")
    activity ChargePayment(order) -> payment

@ref("payments/activities/charge.go")
activity ChargePayment(order: Order) -> (Payment):
    heartbeat 30s
    options:
        start_to_close_timeout: 60s
```

**Why needed:** As a design DSL, TWF captures intent — but teams also need to find the real code. Reference annotations close that loop, making `.twf` files a living index of the project. LSP go-to-definition could resolve `@ref` paths to open the actual source file.

**Open questions:** Paths relative to repo root, or allow URLs for multi-repo setups? Should the LSP validate that `@ref` targets exist? Could references be auto-populated by scanning the codebase for matching workflow/activity registrations?

**Elevated by one-package layout (reverse-engineering work):** with all `.twf` in one package
(see Packages and Project Structure), `.twf` layout no longer mirrors code layout, so the
implementation link can't be inferred from location — it must be explicit. The design skill's
**interim** is a top-of-file comment linking each `.twf` to its implementation dir(s); `@ref` is the
durable, machine-checkable form. The project-discovery subagent (author-go existing-repo detection +
design reverse-engineering) both *reads* these links to find code and *writes* them during
extraction — which is exactly the "auto-populate by scanning the codebase" question above.

---

## Design Quality Linting

### `twf lint` Command

A design-quality pass beyond syntax/resolution validation (`twf check`) to catch common anti-patterns and missing considerations.

**Potential checks:**

| Check | Category | Description |
|-------|----------|-------------|
| Unbounded loops | History | `for:` without `continue_as_new` — history grows forever |
| Missing continue-as-new | History | Signal-driven loops with no history reset strategy |
| Missing error handling | Resilience | Activities with no timeout/retry configuration |
| Signal vs update choice | Design | Signal used where update semantics seem more appropriate |
| Unbounded tool/retry loops | Safety | Loops calling activities with no iteration bound |
| Missing queries | Observability | Stateful workflow with no query handlers for inspection |
| Large activity fan-out | Performance | Many parallel activities without task queue routing |
| Sequential child workflow loop | Performance | `for` loop with synchronous child workflow calls — usually should be parallel |
| Blocking update handler | UX | Update handler calls child workflow or long-running activity — caller blocks for entire duration |
| Fallback-path history growth | History | Workflow is short-lived on happy path but enters unbounded wait loop on fallback without continue-as-new |

**Why difficult:** TWF is intentionally high-level. Many checks require understanding *intent*, not just structure.

**Possible approach:** Advisory warnings (not errors) with suppression comments:
```twf
# twf:lint-ignore unbounded-loop
for:
    await signal Event -> event
    activity ProcessEvent(event)
```

**Open questions:** Configurable per-project? Run as part of `twf check` with `--strict`, or separate command? How to avoid false positives on intentionally simple designs?
