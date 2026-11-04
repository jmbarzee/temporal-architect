# Workers, Task Queues, and Deployment Topology

> **Example:** [`task-queues.twf`](./task-queues.twf)

Workers group type registrations, task queues route work to them, and namespaces instantiate workers with deployment options: **what runs together, how work reaches it, and where it's deployed.**

## Workers and Namespaces

- A `worker` is a **type set** — only `workflow`, `activity`, and `nexus service` entries, no deployment config. Worker names are `lowerCamelCase`; workflow/activity names stay `UpperCamelCase`.
- A `namespace` instantiates workers, each with an `options:` block that requires `task_queue`, and exposes `nexus endpoint`s whose `task_queue` must match a worker registering the called service in that namespace — an endpoint exposes every service on its queue ([nexus.md](./nexus.md)).
- The same worker can be instantiated in several namespaces (e.g. `prod` and `staging`). A task queue is scoped to its namespace: the same queue name in two namespaces is two queues.
- Several workers may share a queue only if they register the **same** workflows and activities, and — among those that register nexus services — the same services (a worker with none polls no Nexus tasks); the same type set on different queues is a tier the caller picks by queue.
- A call's `task_queue` (or its target's `default_options:` one) names a queue in the caller's own namespace (crossing namespaces is Nexus's job); without one, the call goes to the caller's own queue. Either way, some worker on a matching queue in the caller's namespace must register the target ([matching](#template-parameters-vs-runtime-interpolation)).
- Names are plain identifiers except the namespace name, nexus endpoint name, and endpoint reference, which take the `deploy_name` form (hyphens, `{param}` template parameters; `twf spec tokens-and-keywords`).

`twf check` enforces these — diagnostics in [common-errors.md](../reference/common-errors.md).

### Worker Options

The worker `options:` block names worker behaviours **every Tier-1 SDK** has; each author skill maps them to its SDK. Use it for **strategy and intent**, not numeric ops tuning (exact poller counts and cache TTLs belong in implementation):

- **`task_queue`** (required) — routing; pins the worker pool. A `{param}` makes the instantiation a [per-instance family](#per-instance-worker-families).
- **`versioning: none | build_id | deployment`** — the pool's worker-versioning strategy, a reliability decision the design should make ([versioning.md](./versioning.md#declaring-the-strategy-in-twf)). Concrete Build IDs / deployment names are deploy-time inputs, not `.twf` content.
- **Concurrency caps and rate limiters** (`max_concurrent_*`, `*_rate_limit`, sticky cache) — ops tuning; set them only when a workload demands it.

Full key list: `twf spec workers-and-namespaces`.

## Task Queue Design

| Single Queue | Multiple Queues |
|--------------|-----------------|
| Simple deployment | More operational complexity |
| All workers handle all work | Workers specialize |
| Scaling affects everything | Scale queues independently |
| One failure domain | Isolated failure domains |

Share a queue unless one of these calls for a separate one — never one queue per workflow type, and never a namespace per runtime ([namespaces.md](../reference/namespaces.md)):

| Use Case | Rationale |
|----------|-----------|
| **Different resource requirements** | CPU-heavy vs I/O-heavy |
| **Specialized capabilities** | GPU workers, licensed software |
| **Different scaling characteristics** | Bursty vs steady |
| **Priority handling** | High-priority vs batch |
| **Isolation requirements** | Tenant isolation, security boundaries |
| **Geographic distribution** | Region-specific workers |

**Keep the queue set bounded by what polls it.** A task queue needs no registration, and an idle one is unloaded and eventually scavenged. Many queues cost in four places:

- **Pollers** — every worker polls each queue it serves, and a namespace caps concurrent polls (Cloud: 20,000 per task type).
- **Metric cardinality** — `task_queue` tags SDK and server metrics.
- **Versioning** — a deployment version accepts at most 100 distinct queues over its life ([versioning.md](./versioning.md)).
- **Orphaned tasks** — a task routed after the queue's last poller exits waits unbounded unless the call sets `schedule_to_start_timeout`, and a task that never expires keeps its queue alive.

A per-entity queue whose worker lives as long as the entity is a [family](#per-instance-worker-families). A per-request queue nobody owns (`"request-{requestId}"`) is not; select from a fixed set instead (`"high"`, `"medium"`, `"low"`).

### Template parameters vs. runtime interpolation

`{x}` means something different in each position:

| `{x}` position | Meaning | Check |
|----------------|---------|-------|
| **Namespace or endpoint name** — `namespace tenant-{org}:` | A family of deployments, one per value ([namespaces.md](../reference/namespaces.md#parameterized-namespaces-and-endpoints)) | Correlates with other names by spelling; never reaches an option string |
| **Worker `task_queue`** — `"sandbox-{sandboxId}"` | **Instance parameter**: a [per-instance worker family](#per-instance-worker-families), one queue per value | Local to the instantiation; must be well formed (`QUEUE_TEMPLATE_MALFORMED`) |
| **Endpoint `task_queue`** | Not allowed: an endpoint targets one static queue | `ENDPOINT_TASK_QUEUE_TEMPLATED` |
| **Call-site or `default_options:` `task_queue`** — `"sandbox-{lease.sandboxId}"` | **Runtime interpolation** of the caller's data, per call | Matches a worker queue **by shape**: equal fixed text, parameters in the same positions, names ignored |
| **`worker_identity`** — `"sidecar-{podName}"` | Free text, a debugging label | None |

- **A per-tenant namespace does not need a per-tenant queue name.** A queue is scoped to its namespace, so `"orders"` in `tenant-acme` and in `tenant-globex` are already two queues.
- **Shape matching is strict.** `"workers-{request.region}"` routes only to a family (`"workers-{region}"`), never to static `"workers-us"` and `"workers-eu"`; model such a set as a family or as static calls. A parameter-free call queue matches only its own spelling.
- **A learned queue** is a call-site value that is exactly one parameter (`"{lease.queue}"`): a name the caller got at runtime, as when a worker hands back its own queue. It matches any family; a static queue only by its own spelling.
- **A per-tenant queue family in one shared namespace** (`"orders-{org}"`) is legitimate and long-lived; the family hints below are advisory there. Task-queue priority and fairness keys are the in-queue alternative to a queue per tenant, but they are pre-release: check docs.temporal.io/develop/task-queue-priority-fairness before recommending them.

## Per-instance worker families

A `{param}` in a worker's `task_queue` declares many workers, each polling its own concrete queue: Temporal's worker-specific task queue pattern, for a sandbox sidecar, a host, or a per-region fleet. The sandbox example in [`task-queues.twf`](./task-queues.twf) runs `sidecar` on `"sandbox-{sandboxId}"`; `Agent` reaches one member with `task_queue: "sandbox-{lease.sandboxId}"`. The `.twf` checks that a call *can* name a polled queue, never which value it names.

- **Families host activities, not workflows or Nexus services.** A workflow task has no schedule-to-start timeout, so an execution whose member is gone for good stalls until its own timeout: a cancel request is recorded but never acted on, and only termination ends it (`INSTANCE_FAMILY_HOSTS_WORKFLOW`). Keep workflows on a shared queue, as `sandboxControl` does. Behind Nexus, a static endpoint's async operation starts a workflow on a shared queue in the family's namespace, and that workflow calls the family ([nexus.md](./nexus.md#fronting-a-worker-family)).
- **Key by entity only when any poller for the key can serve the task.** A replacement pod for the entity then picks up its queued tasks and retries. If the task needs pod-local state, put the pod incarnation in the key.
- **Bound the wait for short-lived instances.** Set `schedule_to_start_timeout` to the longest wait the caller accepts (`INSTANCE_QUEUE_NO_START_TIMEOUT`). It is not retried, so handle its failure by rerouting or rerunning the sequence. Add `heartbeat_timeout` for long calls: a worker that dies mid-attempt is noticed only at heartbeat or start-to-close. For long-lived fleets, monitor schedule-to-start latency instead.
- **Do not version families** (`INSTANCE_FAMILY_VERSIONED`). A churning family exhausts a deployment version's 100-queue cap even with few live instances; legacy `build_id` needs an operator call per queue.
- **Drain before stopping.** Stop routing to the instance first, so callers stop naming its queue; `worker_shutdown_timeout` then lets in-flight attempts finish. A later retry still needs `schedule_to_start_timeout`.
- **Limits are per instance.** `task_queue_activity_rate_limit` caps each member's queue, not the family.
- **Authorization is per namespace.** A family worker's credentials reach everything in its namespace. Beside untrusted code (the sandbox case), keep the Temporal worker outside the trust boundary, or put the family in its own namespace behind Nexus.
- **Give each family its own fixed text.** Spellings with the same fixed text are one family, so `"sandbox-{sandboxId}"` and `"sandbox-{id}"` must register the same type set; two bare families (`"{hostId}"`, `"{podId}"`) collide the same way. A static queue a member could take (`"sandbox-pool"`) draws `TASK_QUEUE_OVERLAP`.
