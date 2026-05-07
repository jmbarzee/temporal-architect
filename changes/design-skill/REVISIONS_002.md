# Design Skill Revisions: Topic Examples — Globally Unique Names + Worker/Namespace Coverage

**Source:** Visualizer bug report — workflows in different files with the same name displayed as one node.
**Focus:** Make every workflow / activity / worker / nexus service / nexus endpoint name globally unique across `skills/design/topics/*.twf`. Add `worker` + `namespace` blocks to every file so each example is deployment-complete. Mirror the renames into the matching `*.md` prose so the design skill stays in sync.

## Why

The visualizer keys graph nodes by `${nodeType}:${name}` (`tools/visualizer/src/graph/build.ts`). When the user opened `skills/design/topics/` as a folder, ~30 cross-file collisions silently merged distinct workflows/activities into single graph nodes. The CLI's resolver (`tools/lsp/parser/resolver/resolver.go`) already detects cross-file duplicates when given multiple files at once, but the topic library was never run through it as a single project, so the collisions had quietly accumulated.

The right unit-of-uniqueness for these topic files is "the topic library as a whole", because that is what the visualizer presents when the user opens the folder. This change brings the corpus into compliance with that contract. The visualizer fix itself (defensive node-id de-merge + extension calling multi-file `twf parse`) is a separate change and not in scope here.

## Canonical-owner assignments

When a name appeared in multiple files, one file became the canonical owner; the others were renamed.

### Workflows

| Name | Canonical owner |
|------|-----------------|
| `OrderWorkflow` | `task-queues.twf` |
| `ApprovalWorkflow` | `signals-queries-updates.twf` |
| `ClusterManager` | `promises-conditions.twf` |
| `ProcessPaymentWorkflow` | `nexus.twf` |
| `WaitForResource` | `timers-scheduling.twf` |

### Activities

| Name | Canonical owner |
|------|-----------------|
| `ValidateOrder` | `task-queues.twf` |
| `ProcessPayment` | `patterns.twf` |
| `ChargePayment` | `task-queues.twf` |
| `ShipOrder` | `task-queues.twf` |
| `SendNotification` | `timers-scheduling.twf` |
| `SendEmail` | `child-workflows.twf` |
| `LookupPayment` | `nexus.twf` |
| `RecordTransaction` | (split — renamed in both owners) |
| `ProvisionCluster`, `StartCluster` | `promises-conditions.twf` |

### Workers / nexus services / endpoints

| Name | Canonical owner |
|------|-----------------|
| `paymentWorker` | `task-queues.twf` |
| `orderWorker` | `task-queues.twf` |
| `PaymentsService` / `PaymentsEndpoint` | `nexus.twf` |

## Renames per file

### `task-queues.twf` (canonical e-commerce + media)

- Activity `LookupPayment` → `GetPaymentStatus` (matches the operation name `CheckPaymentStatus` it backs in `PaymentService`).
- No worker/namespace changes (already present).

### `signals-queries-updates.twf` (signal-driven order tracking, approvals, subscription, shipping)

- Workflow `OrderWorkflow` → `OrderTrackingWorkflow`.
- Workflow `ClusterManager` → `JobCoordinator`. Condition `clusterStarted` → `jobReady`. Update `WaitUntilStarted` → `WaitUntilReady`. Type `ClusterState` → `JobState`. Type `Config` → `JobConfig`.
- Activity `ValidateOrder` → `ValidateOrderRecord`.
- Activity `GetOrder` → `LoadOrderRecord`.
- Activity `ProcessBatch` → `RunBatchProcessing`.
- Activity `ProvisionCluster` → `ProvisionJobRunner`.
- Activity `StartCluster` → `StartJobRunner`.
- ADD `worker handlerWorker` registering all workflows + activities.
- ADD `namespace handlers` instantiating the worker on `task_queue: "handlers"`.

### `nexus.twf` (cross-namespace payments + notifications)

- Workflow `OrderWorkflow` → `OrderCheckout`.
- Activity `ValidateOrder` → `ValidateCheckout`.
- Activity `RecordTransaction` → `RecordPaymentTransaction`.
- Activity `SendEmail` → `SendPaymentConfirmation`.
- Worker `orderWorker` → `checkoutWorker`. Task queue `orders` → `checkout`.
- Worker `paymentWorker` → `paymentProcessingWorker`.

### `testing.twf` — DOMAIN SHIFT (renewals + leave/PTO)

The previous order/approval/payment shapes collided with multiple files. Re-themed around two real domains that produce the same testable shapes:

- Workflow `OrderWorkflow` → `RenewalProcessing`. Type `Order` → `Renewal`. Type `OrderResult` → `RenewalResult`. Activities:
  - `ValidateOrder` → `ValidateRenewalRequest`
  - `ProcessPayment` → `ChargeRenewalPayment`
  - `ShipOrder` → `ActivateRenewedPlan`
- Workflow `ApprovalWorkflow` → `LeaveRequestApproval`. Type `Request` → `LeaveRequest`. Activity `NotifyApprovers` → `NotifyManagers`.
- `ReminderWorkflow`, `StatusWorkflow`, `SubscriptionManager` retained (already unique).
- ADD `worker testingWorker` + `namespace testing`.

### `versioning.twf` — DOMAIN SHIFT (insurance underwriting + batch ETL + enrichment)

The previous workflow names all started with `OrderWorkflow*` and the activities collided with `task-queues`/`patterns`/`testing`. Re-themed around three real workloads to give each version-flag pattern a natural setting:

- Workflow `OrderWorkflowAddStep` → `UnderwritingAddFraudCheck`.
- Workflow `OrderWorkflowRemoveStep` → `BatchJobRemoveLegacyStep`.
- Workflow `OrderWorkflowChangeStep` → `BatchJobChangeProcessor`.
- Workflow `ReorderWorkflow` → `BatchJobReorderSteps`.
- Workflow `ParamChangeWorkflow` → `EnrichmentChangeParams`.
- Workflow `MultiVersionWorkflow` → `UnderwritingMultiFlag`.
- Activity `ValidateOrder` → `ValidatePolicy`.
- Activity `ProcessPayment` → `BindPolicy`.
- Type `Order` → `Policy`. Type `OrderResult` → `PolicyResult`.
- ADD `worker versioningWorker` + `namespace versioning`.

### `patterns.twf` (loan + bank account + travel saga + ETL pipeline + document approval + polling)

- Workflow `WaitForResource` → `AwaitResourceReady` (the polling shape with status checks; `timers-scheduling.twf` keeps the simpler canonical `WaitForResource`).
- Activity `ValidateOrder` → `ValidateRetailOrder` (in `OrderFulfillment`).
- Activity `ShipOrder` → `ShipRetailOrder` (in `OrderFulfillment`).
- Activity `ChargePayment` → `ChargeBookingPayment` (in `BookingWorkflow` saga — distinct from `task-queues`'s canonical `ChargePayment`).
- Activity `RecordTransaction` → `RecordAccountTransaction` (in `AccountEntity`).
- ADD `worker patternsWorker` + `namespace patterns`.

### `promises-conditions.twf` (parallel processing + cluster + cross-namespace billing)

- Workflow `ProcessPaymentWorkflow` → `BillingChargeWorkflow`.
- Nexus service `PaymentsService` → `BillingService`. Operation `ProcessPayment` → `ChargePayment`.
- Nexus endpoint `PaymentsEndpoint` → `BillingEndpoint`.
- Worker `paymentWorker` → `billingWorker`. Task queue `payments` → `billing`.

### `child-workflows.twf` (deployment + onboarding + batch children)

- Activity `SendNotification` → `SendCustomerNotification` (collided with `timers-scheduling`'s canonical).
- Workflow `ProcessBatch` → `ParallelItemBatch` (collided with `examples/document-ingestion-pipeline/document-ingestion-pipeline.twf`'s canonical `ProcessBatch`; the topic version is illustrative fan-out, the example is a real document batch).
- ADD `worker childWorkflowsWorker` + `namespace deployment`.

### `activities-advanced.twf` (large-file processing + human-approval publishing)

- Workflow `ApprovalWorkflow` → `PublishApprovalWorkflow`.
- Workflow `TimeoutConfigDemo` → `LargeFileIngestion` (more concrete framing).
- ADD `worker activitiesAdvancedWorker` + `namespace activitiesAdvanced`.

### `long-running.twf` (event stream + user account entity)

- No renames (all names were already unique).
- ADD `worker longRunningWorker` + `namespace longRunning`.

### `timers-scheduling.twf` (canonical polling + monitoring + delayed notifications)

- No renames (all names were already unique or canonical here).
- ADD `worker schedulingWorker` + `namespace scheduling`.

## Mirrored `.md` updates

Each rename above was mirrored in the matching topic `.md` file where the prose used the old name in an example block. Highlights:

- `signals-queries-updates.md`: `OrderWorkflow` → `OrderTrackingWorkflow`, `ClusterManager` example block → `JobCoordinator` (+ condition + update + activities).
- `nexus.md`: `paymentWorker` → `paymentProcessingWorker` in the deployment example.
- `promises-conditions.md`: `nexus PaymentsEndpoint PaymentsService.Charge(card)` → `nexus BillingEndpoint BillingService.ChargePayment(card)`.
- `patterns.md`: `OrderFulfillment` activities, `BookingWorkflow` saga's `ChargePayment`, `AccountEntity`'s `RecordTransaction`, and `WaitForResource` polling example all aligned to the new names.
- `activities-advanced.md`: `ApprovalWorkflow` → `PublishApprovalWorkflow`.
- `testing.md`: `OrderWorkflow`/`ApprovalWorkflow` examples replaced with `RenewalProcessing`/`LeaveRequestApproval`. Replay tests, query test, and end-to-end example all updated to new domain.
- `timers-scheduling.md`: cross-referenced `OrderFulfillment` example aligned to `patterns.twf`'s renamed activities (`ValidateRetailOrder`, `ShipRetailOrder`).
- `versioning.md`: basic patching pattern, worker config example, parallel-version example (`OrderWorkflowV1`/`V2` → `PolicyV1`/`V2`), and "Document Versions" header all aligned to the new domains.

## Verification

Before:

```
$ twf check skills/design/topics/*.twf 2>&1 | grep -c duplicate
30
```

After:

```
$ twf check skills/design/topics/*.twf
✓ OK: 67 workflow(s), 128 activity(s)
```

Zero duplicate errors, zero unregistered activities, zero unresolved nexus references. Every workflow and activity is now reachable from a worker in some namespace. The visualizer can now load `skills/design/topics/` as a folder and render every example as a distinct node.

## What this change does NOT include

- **No visualizer/parser code changes.** The graph builder still keys nodes by `${nodeType}:${name}`. A future change should make node ids include `sourceFile` defensively, and the VS Code extension should call `twf parse` once with all files (not per-file) so cross-file duplicate diagnostics surface in the IDE. Tracked separately.
- **No changes to `examples/<name>/*.twf`.** Those examples were already collision-free.
- **Skill metadata** (`SKILL.md`, references in `skills/design/reference/*`) was not audited for stale workflow names from the topic library. Quick spot check did not find any, but a fuller scan is a candidate for a follow-up `review-quality-skill` cycle.

## Files touched

```
skills/design/topics/activities-advanced.twf
skills/design/topics/activities-advanced.md
skills/design/topics/child-workflows.twf
skills/design/topics/long-running.twf
skills/design/topics/nexus.twf
skills/design/topics/nexus.md
skills/design/topics/patterns.twf
skills/design/topics/patterns.md
skills/design/topics/promises-conditions.twf
skills/design/topics/promises-conditions.md
skills/design/topics/signals-queries-updates.twf
skills/design/topics/signals-queries-updates.md
skills/design/topics/task-queues.twf
skills/design/topics/testing.twf
skills/design/topics/testing.md
skills/design/topics/timers-scheduling.twf
skills/design/topics/timers-scheduling.md
skills/design/topics/versioning.twf
skills/design/topics/versioning.md
```

`long-running.md`, `task-queues.md`, and `child-workflows.md` were not touched (no name conflicts in their prose with the renamed identifiers).
