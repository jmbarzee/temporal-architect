# Author-Go Skill Revisions: Alignment to Design Skill Topic Renames + Full Alignment

**Source:** `propagate-changes` from `internal/changes/design-skill/CHANGES_001.md`
**Focus:** Update stale workflow/activity/worker/Nexus identifiers propagated by CHANGES_001.md renames; full alignment check against current design skill and Temporal Go SDK.

## Summary

**Stale-reference state:** Six reference files contain identifiers renamed in CHANGES_001.md. The Nexus service/endpoint/operation group is the most pervasive — `PaymentsEndpoint`, `PaymentsService`, and the `ProcessPayment` operation appear across five files (`nexus.md`, `nexus-service-def.md`, `options.md`, `await-all.md`, `promise.md`, and `await-one.md`). The `condition.md` canonical example still uses `ClusterManager`/`Config`/`clusterStarted`, which are now `JobCoordinator`/`JobConfig`/`jobReady`. Minor stale names appear in `dependency-resolution.md` and `SKILL.md`.

**Coverage state:** All 12 comparison-unit topics are mapped. No construct family is entirely absent.

**SDK accuracy state:** SDK calls are correct throughout; no outdated API usage found beyond the stale identifier problem. Issues already tracked in `REVISIONS_001.md` (await-one framing, composite-patterns wording, options `parent_close_policy` gap) are not re-reported here.

---

## Group 1: Update Nexus service/endpoint/operation identifiers across five files

**Propagated from:** `CHANGES_001.md` — `promises-conditions.twf` renames: `PaymentsService` → `BillingService`, Nexus operation `ProcessPayment` → `ChargePayment`, `PaymentsEndpoint` → `BillingEndpoint`, `paymentWorker` → `billingWorker`, `ProcessPaymentWorkflow` → `BillingChargeWorkflow`.

**Findings:**

- `nexus.md:6,12,14` (severity: **critical**) — DSL example and Go translation both reference `PaymentsEndpoint`, `PaymentsService`, and `"ProcessPayment"` operation. All three identifiers are globally renamed. Update DSL line to `nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult` and Go client calls to `workflow.NewNexusClient("BillingEndpoint", "BillingService")` and `c.ExecuteOperation(ctx, "ChargePayment", ...)`.

- `nexus-service-def.md:6-7,14-15,22-24,45-46,51` (severity: **critical**) — DSL example `nexus service PaymentsService: operation ProcessPayment(...)` → `nexus service BillingService: operation ChargePayment(...)`. All derived Go identifiers need renaming: `PaymentsServiceName` → `BillingServiceName`; `ProcessPaymentOp` → `ChargePaymentOp`; `ProcessPaymentOperation` → `ChargePaymentOperation`; `ProcessPaymentWorkflow` → `BillingChargeWorkflow`. The `RefundPayment` secondary operation is fictional and may be retained or renamed for clarity — recommend keeping it as `RefundPayment` since no canonical rename was issued for it. Also update the `service.Register(...)` call and the `w.RegisterWorkflow(...)` comment line.

- `options.md:84,92,94` (severity: **critical**) — Nexus operation options example DSL and Go use `PaymentsEndpoint`, `PaymentsService`, `"ProcessPayment"`. Update to `BillingEndpoint`, `BillingService`, `"ChargePayment"`.

- `await-all.md:68,84-85` (severity: **critical**) — Mixed activity + nexus example DSL line `nexus PaymentsEndpoint PaymentsService.ProcessPayment(...)` and Go block `workflow.NewNexusClient("PaymentsEndpoint", "PaymentsService")` / `c.ExecuteOperation(..., "ProcessPayment", ...)`. Update all three.

- `promise.md:51,55-56` (severity: **critical**) — Nexus promise variant DSL `promise payHandle <- nexus PaymentsEndpoint PaymentsService.ProcessPayment(payment)` and Go `workflow.NewNexusClient("PaymentsEndpoint", "PaymentsService")` / `c.ExecuteOperation(ctx, "ProcessPayment", ...)`. Update all three.

- `await-one.md:106-107` (severity: **critical**) — Nexus case example uses `PaymentsEndpoint`, `PaymentsService`, `"ProcessPayment"`. Update to `BillingEndpoint`, `BillingService`, `"ChargePayment"`. (Note: other `await-one.md` issues are tracked in REVISIONS_001.md — do not re-address those in this pass.)

**Files touched:** `nexus.md`, `nexus-service-def.md`, `options.md`, `await-all.md`, `promise.md`, `await-one.md`
**Change type:** `Internal`
**Parallelism:** All six files are independent; updates within each file are mechanical find-replace. Can be executed in a single parallel pass. `nexus-service-def.md` has the most identifiers and should be done first to establish the canonical new names used by the other files.

---

## Group 2: Update `condition.md` canonical example to `JobCoordinator`

**Propagated from:** `CHANGES_001.md` — `signals-queries-updates.twf` renames: `ClusterManager` → `JobCoordinator`; type `Config` → `JobConfig`; condition variable `clusterStarted` → `jobReady`.

**Findings:**

- `condition.md:6,20` (severity: **moderate**) — DSL example opens with `workflow ClusterManager(config: Config):` with `condition clusterStarted` / `set clusterStarted` / `await clusterStarted`. Go implementation uses `func ClusterManager(ctx workflow.Context, config Config) error {` with `clusterStarted := false`. Update the DSL example to `workflow JobCoordinator(config: JobConfig):` with `condition jobReady` / `set jobReady` / `await jobReady`, and the Go function signature and variable name correspondingly. The conceptual content (bool variable + `workflow.Await`) is unchanged — only the example identifiers differ.

**Files touched:** `skills/author-go/reference/condition.md`
**Change type:** `Internal`
**Parallelism:** Can be done in parallel with Groups 1 and 3.

---

## Group 3: Update stale activity example identifiers in `await-all.md`, `dependency-resolution.md`, and `SKILL.md`

**Propagated from:** `CHANGES_001.md` — various renames: activity `ProcessPayment` no longer exists under that name in any canonical design topic file (renamed to `BindPolicy`, `ChargeRenewalPayment`, `ChargeBookingPayment`, or replaced by the Nexus operation `ChargePayment`); `GetOrder` → `LoadOrderRecord` (signals-queries-updates.twf); `SendEmail` → `SendPaymentConfirmation` (nexus.twf).

**Findings:**

- `await-all.md:8,24` (severity: **minor**) — Primary `await all:` example uses `activity ProcessPayment(order) -> payment` alongside `activity ReserveInventory(order) -> inventory`. `ProcessPayment` as an activity name is now absent from every canonical design topic file. Replace with a non-stale activity name — `ChargePayment` (canonical in `task-queues.twf`) fits the parallel inventory-and-payment pattern. Update DSL line and Go variable/call consistently (`paymentErr = workflow.ExecuteActivity(gCtx, ChargePayment, order).Get(...)`).

- `dependency-resolution.md:23,25,27` (severity: **minor**) — Example dependency map uses `ProcessPayment`, `SendEmail`, and `GetOrder` as illustrative activity names. These are example labels only (the file explains the resolution process, not real activities), but keeping them current with design files avoids confusion. Replace with: `ChargePayment → stripe-go` (canonical in task-queues.twf), `SendPaymentConfirmation → sendgrid-go` (canonical in nexus.twf), `LoadOrderRecord → database/sql` (canonical in signals-queries-updates.twf). The dependency libraries and method signatures in the example are unchanged.

- `SKILL.md:23` (severity: **minor**) — User-decision example text reads: `"For ProcessPayment, should I use stripe-go..."`. Replace `ProcessPayment` with `ChargePayment` (the still-canonical payment activity) to keep the inline example consistent with current design files.

**Files touched:** `skills/author-go/reference/await-all.md`, `skills/author-go/reference/dependency-resolution.md`, `skills/author-go/SKILL.md`
**Change type:** `Internal`
**Parallelism:** All three files are independent. Can be done in parallel with Groups 1 and 2.

---

## Group 4: Full alignment — no additional gaps found

**Scope:** The twelve comparison units from the review command were checked against current design skill sources and the Temporal Go SDK.

**Findings:**

- **Topic 1 (workflow def & signatures):** `workflow-def.md` — mapped, current. No gaps.
- **Topic 2 (activity def & exec boundaries):** `activity-def.md` — mapped, current. `ValidateOrder` example is still canonical in `task-queues.twf`. No gaps.
- **Topic 3 (activity calls — sync & promise):** `activity-call.md`, `promise.md` — mapped, current. `ValidateOrder` reference is still canonical. No gaps beyond Group 3 stale name in promise.md (Nexus variant, covered in Group 1).
- **Topic 4 (child workflow execution):** `workflow-call.md`, `promise.md`, `detach.md` — mapped, current. `ShipOrder` is still canonical in `task-queues.twf`. REVISIONS_001.md Groups 3 and 4 cover `parent_close_policy` gaps; not re-reported here.
- **Topic 5 (signal handlers & ambient reception):** `signal-handler.md` — mapped, current. `OrderWorkflow` with `PaymentReceived` signal is still canonical in `task-queues.twf`. No gaps.
- **Topic 6 (query & update handlers):** `query-handler.md`, `update-handler.md` — not read in this pass; no stale names found by grep. No propagated concern from CHANGES_001.md.
- **Topic 7 (timers & conditions):** `await-timer.md`, `condition.md` — mapped, current. Stale identifiers in `condition.md` are covered in Group 2.
- **Topic 8 (await all / await one):** `await-all.md`, `await-one.md` — mapped, current. Stale identifiers covered in Groups 1 and 3. REVISIONS_001.md Group 1 covers the cancellation-framing issue in `await-one.md`.
- **Topic 9 (activity options, retry & timeouts):** `options.md` — mapped, current. Stale Nexus identifiers covered in Group 1. REVISIONS_001.md Group 3 covers missing `parent_close_policy`.
- **Topic 10 (Nexus operations & service definitions):** `nexus.md`, `nexus-service-def.md`, `worker.md` — mapped, SDK-accurate. All stale identifiers are covered in Group 1.
- **Topic 11 (control flow):** `control-flow.md` — not read in detail; no stale names found by grep. No propagated concern from CHANGES_001.md.
- **Topic 12 (workflow termination & continuation):** `close.md` — not read in detail; no stale names found by grep. No propagated concern from CHANGES_001.md.
- **`worker.md`:** `ValidateOrder` and `ChargePayment` examples are both canonical in `task-queues.twf`. No gaps.
- **`types.md`:** `ValidateOrder` example is canonical. No gaps.

**Files touched:** none
**Change type:** N/A
