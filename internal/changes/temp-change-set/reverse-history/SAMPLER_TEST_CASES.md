# Sampler Integration Test Cases

Identified case set for the sampler / reverse-history integration suite at
[test/integration/sampler/](../../../../test/integration/sampler/). This is the **catalog**
produced by the case-identification effort, not the implementation. Cases here are
candidates to add to `cases()` in
[suite_test.go](../../../../test/integration/sampler/suite_test.go); implementation is a
separate cycle.

Design/architecture hub: [GRAPH_FROM_HISTORY.md](GRAPH_FROM_HISTORY.md). Deferred work:
[BACKLOG.md](BACKLOG.md).

---

## 1. What the suite tests

One contract, end to end:

```
real Go workflows on a dev server
  -> sampling.Sample (Visibility enumerate + per-type sample)
  -> history.Build (events -> graph.Graph)
  -> assert nodes/edges in the graph vocabulary
```

The harness ([harness_test.go](../../../../test/integration/sampler/harness_test.go)) runs each
`Case` against its own in-process dev server, registers the `WorkerSpec`s, starts the
`StartSpec`s and waits for completion, then samples with a 3-step `expansionSchedule`
(`{10%,min1} -> {50%,min3} -> {100%,min huge}`) until the `Expect` holds or the full
sample is exhausted. Assertions are **existential** over the built graph
(`nodePresent` / `edgePresent`), keyed by `graph.DefKey(kind, name)`, plus optional
`MinNodes` / `MinEdges`.

## 2. How this catalog was produced

Three discovery passes (the methods in the originating request):

1. **Primary — `twf graph` over the design topics.** Built `twf` and ran
   `twf graph <file>` over all 11 files in
   [skills/temporal-architect-design/topics/](../../../../skills/temporal-architect-design/topics/).
   This is the *static* graph (`graph.Extract`) — the design-intent ground truth, and the
   richest catalog of meaningful node/edge shapes.
2. **Temporal docs MCP** (`user-temporal-docs`) — cross-checked which history events real
   executions emit for scenarios the topics under-represent (continue-as-new run
   boundaries, external signals, cross-namespace child/signal, failures).
3. **The `twf` binary code** — the authoritative supported set: the event switch in
   [history.go](../../../../tools/lsp/parser/history/history.go), the vocabulary constants in
   [graph.go](../../../../tools/lsp/parser/graph/graph.go), and the sampling rules in
   [sampling.go](../../../../tools/sampler/sampling/sampling.go) /
   [select.go](../../../../tools/sampler/sampling/select.go).

### 2.1 Topic -> shape inventory (Pass 1 result)

| Topic | Namespaces | Edge kinds in static graph | Notable shapes |
|---|---|---|---|
| activities-advanced | 1 | activityCall | uncalled activity (`ResumableProcess`, orphan) |
| child-workflows | 1 | activityCall, workflowCall | parent calls same child twice (dedup); nested child chains; fan-out children |
| long-running | 1 | activityCall | same activity called 4x (dedup); continue-as-new (UserEntity) |
| nexus | 3 | nexusCall, asyncBacking, activityCall | cross-namespace; nexus tier; coarsened ns/worker edges |
| patterns | 1 | activityCall, workflowCall | saga compensation child call; fan-out; repeated activities |
| promises-conditions | 2 | activityCall, workflowCall, nexusCall, asyncBacking | cross-namespace nexus; async child |
| signals-queries-updates | 1 | activityCall | signals/queries/updates are **handlers**, produce no signalSend edge |
| task-queues | 3 | activityCall, nexusCall, asyncBacking | **same def on two queues -> two nodes**; explicit routing `{explicit=...}` |
| testing | 1 | activityCall | repeated activities |
| timers-scheduling | 1 | activityCall | timers produce no edges |
| versioning | 1 | activityCall | repeated activities across version branches |

Key Pass-1 finding: **no topic produces a `signalSend` edge.** In the DSL, `signal` is a
*handler* (inbound), not an external send; the graph's `signalSend` edge and the
`SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED` event come from a workflow signalling
*another* workflow. So signalSend cases must be **synthesized** in Go (the existing
`history` unit test does this with `OrderSaga -> ProcessPayment`).

## 3. Supported vocabulary (assertable today)

`history.Build` reconstructs only this subset. Everything else is deferred (§6).

- **Node kinds:** `namespace`, `worker`, `workflow`, `activity`
  (worker name = task-queue name, per the 1-worker-per-queue assumption).
- **Edge kinds:** `containment` (always), `activityCall`, `workflowCall`, `signalSend`.
- **Driving events:** `WORKFLOW_EXECUTION_STARTED` (root), `ACTIVITY_TASK_SCHEDULED`,
  `START_CHILD_WORKFLOW_EXECUTION_INITIATED`, `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED`.
- **Routing:** history always emits empty routing (`{}`). The *cause* of a dispatch
  (explicit task_queue override) is **not** reconstructable from history — only the
  *effect* (callee observed on a queue) is. So `{explicit=...}` shapes in `task-queues.twf`
  collapse to plain edges; assert the callee node/queue, never the routing cause.

Two coverage axes drive the case set: the **structural axis** (cover the supported
vocabulary exhaustively) and the **real-use axis** (simulate what production histories do
to the pipeline).

---

## 4. Structural-axis cases

Each case lists: source pattern, vocabulary covered, a minimal runnable-Go sketch, the
`Expect` (in `ExpectNode`/`ExpectEdge` terms), and sampling notes. `ns` = namespace,
`tq` = task queue. The existing case `single-workflow-activity` is **S1**.

### S1. single-workflow-activity (EXISTS)

- Vocabulary: workflow + activity nodes; one `activityCall`.
- Status: implemented. Baseline; keep as the smoke case.

### S2. workflow-no-dispatch

- Source: any leaf workflow (e.g. `SendConfirmationWorkflow` body w/o calls).
- Vocabulary: `namespace`, `worker`, `workflow` nodes; **containment edges only**.
- Go sketch: `func Wf(ctx) error { return nil }` — registered, started, no activity.
- Expect: nodes `{workflow:Wf, worker:tq, namespace:default}`; **no dispatch edges**.
- Why: proves a root-only history yields a clean node with zero spurious dispatch edges.
  Needs a **negative** assertion (no edges) — see usability gap U1/U2.

### S3. workflow-multiple-distinct-activities

- Source: `patterns.OrderFulfillment` (5 distinct activities).
- Vocabulary: multiple distinct `activity` nodes; multiple `activityCall` edges.
- Go sketch: `Wf` executes `A`, `B`, `C` sequentially (`.Get` each).
- Expect: 3 activity nodes, 3 `activityCall` edges from `Wf`.

### S4. workflow-repeated-activity (dedup)

- Source: `long-running.UserEntity` (`PersistUser` x4); `patterns` (`CancelFlight` x3).
- Vocabulary: one `activity` node, one `activityCall` edge despite N schedules.
- Go sketch: `Wf` calls `A` three times in a row.
- Expect: exactly **one** `activity:A` node and **one** `activityCall` edge.
- Why: tests `history.Build` edge dedup (`edgesSeen`). Needs **exact-count** assertion to
  be meaningful (U1) — existential presence alone can't catch over-emission.

### S5. fan-out-same-activity

- Source: `patterns.BatchProcessor` (activity per item in a loop).
- Vocabulary: same as S4 but via a runtime loop over input size.
- Go sketch: `for i := range items { ExecuteActivity(A, items[i]) }`, await all.
- Expect: one `activity:A` node, one `activityCall` edge regardless of item count.
- Why: real fan-out (variable count) still collapses to one edge; pairs with `MinNodes`.

### S6. multiple-workflows-shared-activity

- Source: `patterns` (`RecordAccountTransaction` reachable from multiple workflows);
  several topic activities are shared.
- Vocabulary: one shared `activity` node, **two incoming** `activityCall` edges from
  distinct workflow nodes (caller never splits a node).
- Go sketch: register `WfA`, `WfB`, both call `Z` on the same tq; start both.
- Expect: one `activity:Z` node; `activityCall` edges `WfA->Z` and `WfB->Z`.

### S7. parent-child-same-queue

- Source: `child-workflows.ParentWorkflow -> ChildWorkflow`.
- Vocabulary: `workflowCall` edge; both workflows on one worker.
- Go sketch: parent `ExecuteChildWorkflow(ctx, Child).Get(...)`, same tq.
- Expect: `workflow:Parent`, `workflow:Child` nodes; `workflowCall` Parent->Child.
- Variant **S7b** (dedup): parent calls the same child twice (topic does this at lines
  8 & 11) -> one `workflowCall` edge.

### S8. parent-child-cross-queue

- Source: `child-workflows` cross-queue; matches the `history` unit-test fixture.
- Vocabulary: two workers (two tqs), `workflowCall` + **worker-tier coarsened edge**.
- Go sketch: parent on `parent-tq`, child started with
  `ChildWorkflowOptions{TaskQueue: "child-tq"}`; register child on a second worker.
- Expect: `workflowCall` parent->child; coarsened `[worker] parent-tq -> child-tq`.
- Note: assert via `CoarsenedEdges` (no `Expect` field for these yet — U3).

### S9. parent-child-cross-namespace

- Source: cross-namespace child (child started with explicit `Namespace`).
- Vocabulary: `workflowCall` + **namespace-tier coarsened edge**; two `NamespaceSet`s.
- Go sketch: two namespaces; parent in `ns1` starts child with
  `ChildWorkflowOptions{Namespace: "ns2", TaskQueue: "ns2-tq"}`; child worker registered in
  `ns2`. `history.handleChildInitiated` reads `attr.GetNamespace()`.
- Expect: child node under `namespace:ns2`; coarsened `[namespace] ns1 -> ns2`.
- Note: `startDevServer` already provisions extra namespaces via `--namespace` (U7).
  Watch `waitForVisibleCount` — child executions inflate per-ns counts (U8).

### S10. same-definition-two-queues

- Source: `task-queues` (`ShipOrder` on express+standard; `TrackEventWorkflow` on two
  workers).
- Vocabulary: **two `activity` nodes for one definition** (deployment-keyed identity).
- Go sketch: one workflow that, across different executions/inputs, schedules `Z` on
  `tq-a` in some runs and `tq-b` in others (per-activity `TaskQueue` option). Register a
  worker for `Z` on each queue.
- Expect: two distinct `activity:Z` nodes (different worker parents); an `activityCall`
  edge into each.
- Why: the core "two queues -> two nodes" rule. Requires multiple executions to surface
  both queues (ties into R1).

### S11. signal-send-resolved (synthesized; no topic)

- Source: synthesized (DSL has no external-send shape). Mirrors `history` unit test.
- Vocabulary: `signalSend` edge between two workflow nodes.
- Go sketch: `WfA` calls `SignalExternalWorkflow(ctx, targetID, "", "sig", nil)`; `WfB`
  is started with `targetID` and waits on the signal. Both sampled.
- Expect: `signalSend` WfA->WfB (target resolved via the workflowID index).

### S12. signal-send-unresolved

- Source: synthesized. The target is **not** in the sample.
- Vocabulary: an `Unresolved` entry, **no** `signalSend` edge.
- Go sketch: `WfA` signals a workflowID that is never started (or excluded).
- Expect: `g.Unresolved` contains a `signalSend` from WfA; no signalSend edge.
- Note: not expressible with today's `Expect` (no Unresolved/diagnostic matchers — U3),
  and needs a negative edge assertion (U2).

### S13. multi-type-single-namespace

- Source: `patterns` / `testing` (many workflow types in one namespace).
- Vocabulary: many workflow + activity nodes in one namespace.
- Go sketch: register 4-5 distinct workflow types on one worker; start each.
- Why: exercises `sampling.Sample` **per-type enumeration** (the type loop + `sampleCount`
  per type), not just one type. Pairs with `MinNodes`.

---

## 5. Real-use-axis cases

These simulate what production histories do to the pipeline — the emphasis of the request.

### R1. varied-call-patterns-per-type  (the named case)

- One workflow **type**, many executions with different `StartSpec.Args` driving
  different conditional branches, so each execution's history shows a *subset* of the
  design's activities. Only the **union across the sample** reconstructs the full edge set.
- Go sketch: `Wf(ctx, branch int)` where `branch==0` calls `A`; `1` calls `B`; `2` calls
  `A,B,C`. Start ~6 executions spanning all branches.
- Expect: union of `activityCall` edges = `{A,B,C}` once the sample is broad enough.
- Sampling tie-in: with few executions and default `10%/min1`, the first schedule step may
  pull only one execution and **miss rare branches**; the suite's `expansionSchedule`
  must climb to 100% to satisfy `Expect`. This is the central sampling-coverage scenario.
- Variant **R1b (rare branch)**: 20 executions of branch `A`, 1 of branch `C`. Document
  whether the union ever includes `C` before the 100% step (it should only at full sample).

### R2. failed-execution-still-yields-edges

- A workflow that schedules `A` then deterministically fails.
- Why: `history.Build` reads `*_SCHEDULED`/`*_INITIATED` events, not completion status, so
  a failed/terminated execution still yields its observed edges.
- Go sketch: `Wf` does `ExecuteActivity(A).Get(...)` then `return errors.New("boom")`.
- Harness note: the harness currently `t.Fatalf`s on `run.Get` error
  ([harness_test.go](../../../../test/integration/sampler/harness_test.go) ~L209) — a failed
  StartSpec can't be expressed today. Needs `StartSpec.ExpectError` or similar (U9).
- Expect: `activityCall Wf->A` present despite workflow failure.

### R3. determinism (integration level)

- Sample/build twice (or with shuffled namespace order) -> byte-identical graph.
- Already covered as a `history` unit test; an integration variant guards the full
  sampler path. Needs a graph-equality assertion helper (U3).

### R4. low-volume-type-min-per-type

- A type with 1-2 executions total still fully sampled (the `MinPerType` floor /
  `sampleCount` total cap, see [select_test.go](../../../../tools/sampler/sampling/select_test.go)).
- Go sketch: start exactly 2 executions of a type; assert both shapes reconstructed at the
  first schedule step (`min1`/`min3` already covers low volume).

### R5. high-volume-sampling-sufficiency

- Many executions of one type with branch distribution; verify the union of the *sampled*
  subset (not all) reconstructs the full edge set, exercising `SamplePercent` + the
  expansion ladder. Documents the partial-by-construction limitation (GRAPH_FROM_HISTORY §6).

### R6. cross-namespace-multi-namespace-graph

- Combine S9 with workflows in 2-3 namespaces so a single `history.Build` spans namespaces
  and draws cross-namespace `workflowCall` + namespace-tier coarsened edges. Mirrors how
  `twf graph --history <root>` folds all namespaces into one graph.

---

## 6. Deferred / not yet reconstructable

These shapes appear in the topics' static graphs but `history.Build` cannot produce them
today. Listed here so they are recorded, not implemented. Each maps to an item in
[BACKLOG.md](BACKLOG.md).

- **D1. nexusCall edges + nexus nodes** (`nexus.twf`, `promises.CrossNamespaceAsync`,
  `task-queues.PartnerCheckout`). `NEXUS_OPERATION_SCHEDULED` is not decoded.
  -> BACKLOG "Deferred: Nexus reverse-engineering / History nexus decoding".
- **D2. asyncBacking edges** (nexus operation -> backing workflow). Part of the nexus tier.
  -> same BACKLOG section.
- **D3. local activities** — emitted as `MARKER_RECORDED` ("LocalActivity"), not
  `ACTIVITY_TASK_SCHEDULED`. -> BACKLOG "Deferred: history fidelity / Local activities".
- **D4. continue-as-new run boundaries** — CAN closes the run and starts a new run with the
  **same WorkflowID, new RunID, fresh history**. Two consequences: (a) the sampler's
  `<ns>/<wfType>/<id>.json` layout is keyed by WorkflowID, so chained runs **collide /
  overwrite**; (b) `history.Build` indexes by WorkflowID and reads only the first
  `WORKFLOW_EXECUTION_STARTED`, so activities scheduled only in later runs are invisible.
  -> BACKLOG "Deferred: sampler ergonomics" + a new note may be warranted.
- **D5. explicit routing cause** (`{explicit=tq}` in `task-queues.twf`). History emits empty
  routing; only the effect (callee-on-queue) is reconstructable. Not a bug — an inherent
  limit; do not assert routing cause.
- **D6. distinct worker identity on a shared queue** — two worker type-sets polling one
  queue collapse into one synthesized worker (1-worker-per-queue). -> GRAPH_FROM_HISTORY §6.

---

## 7. Harness usability gaps (log)

Discovered while drafting the cases above. These are follow-on suite improvements, not
blockers to identification. Roughly ordered by how many cases they unblock.

- **U1. No exact-count / no-over-emission assertion.** ~~`Expect` is existential plus
  `MinNodes`/`MinEdges`.~~ DONE — `Expect` now carries `MaxNodes`/`MaxEdges` and per-shape
  `EdgeCounts`/`NodeCounts` (exact). S2 uses `MaxNodes`/`MaxEdges`; S4 asserts exactly one
  `RepeatedActivity` node and one `activityCall` edge. These bounded constraints are
  evaluated only at the final (100%) sample (see harness note below), since a narrower
  sample could satisfy an exact/max bound by accident.
- **U2. No negative (absent) assertion.** DONE — `Expect.AbsentNodes`/`AbsentEdges` (also
  evaluated only at the full sample). S2 relies on the `MaxEdges` cap rather than naming an
  absent edge (the spurious edge's target is unknown a priori); S12 will use `AbsentEdges`
  for the signalSend that must not appear.
- **U3. `Unresolved` / `Diagnostics` / `CoarsenedEdges` not assertable.** S8, S9, S12, R3,
  R6 reach into `g.CoarsenedEdges` / `g.Unresolved` directly. Extend `Expect` with
  `CoarsenedEdges`, `Unresolved`, and a graph-equality helper for R3.
- **U4. Running-preference path never exercised.** The harness waits on `run.Get`, so all
  executions are **closed**; `selectCandidates`' running-first branch
  ([select.go](../../../../tools/sampler/sampling/select.go)) is never hit. Testing it needs a
  non-blocking start (a deliberately long-running workflow that the case does not await).
- **U5. Varied-input ergonomics (R1).** DONE — `starts(prefix, tq, wf, argSets...)` expands
  a list of arg-sets into N `StartSpec`s (IDs `<prefix>-<i>`), and `argN(n, args...)` repeats
  one arg-set for skewed distributions. R1 and R1b use both.
- **U6. `expansionSchedule` is opaque to a case.** STILL OPEN — a case still can't declare
  "satisfied only at full sample" or assert *which* step satisfied it. R1/R1b currently rely
  on the ladder climbing to 100% and assert only the final union (the bounded-constraint
  deferral added for U1/U2 gives "evaluate at full sample" for negatives, but not a positive
  "only resolved at step N" assertion). Exposing the satisfying step (return the index from
  the `runCase` loop, or a per-case schedule override) is the remaining work; deferred as
  documentation-only for now.
- **U7. Cross-namespace setup pattern.** `startDevServer` provisions extra namespaces via
  `--namespace`, and each `NamespaceSet` needs its own client + workers. Document this as
  the canonical multi-namespace pattern (S9, R6).
- **U8. `waitForVisibleCount` vs. child executions.** It waits for `len(Starts)` visible
  executions per namespace; child workflows (S7-S9) add executions not in `Starts`, risking
  a count mismatch or premature/late wait. Make the expected count child-aware.
- **U9. Cannot express an expected-failed start (R2).** `runCase` `t.Fatalf`s on
  `run.Get` error. Add `StartSpec.ExpectError` (or `IgnoreResult`) so failed/terminated
  executions can be driven on purpose.

---

## 8. Suggested implementation order

When the case set is implemented (separate cycle), a reasonable order that also drives the
harness improvements:

1. S2, S3, S4 (+ U1/U2 negative/exact assertions) — cheap, high structural coverage.
2. S6, S7, S7b, S13 — multi-caller, child, multi-type.
3. R1 (+ U5/U6) — the headline varied-call-patterns case.
4. S8, S9, R6 (+ U3/U7/U8) — coarsening + cross-namespace.
5. S10, R5 — two-queues + sampling sufficiency.
6. S11, S12 (+ U2/U3) — signal send resolved/unresolved.
7. R2, R4, R3 (+ U9) — failure, low-volume, determinism.
