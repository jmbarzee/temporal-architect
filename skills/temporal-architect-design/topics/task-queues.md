# Workers, Task Queues, and Deployment Topology

> **Example:** [`task-queues.twf`](./task-queues.twf)

Workers group type registrations, task queues route work to them, and namespaces instantiate workers with deployment options: **what runs together, how work reaches it, and where it's deployed.**

## Workers and Namespaces

- A `worker` is a **type set** — only `workflow`, `activity`, and `nexus service` entries, no deployment config. Worker names are `lowerCamelCase`; workflow/activity names stay `UpperCamelCase`.
- A `namespace` instantiates workers, each with an `options:` block that requires `task_queue`, and exposes `nexus endpoint`s whose `task_queue` must match a worker registering the service ([nexus.md](./nexus.md)).
- The same worker can be instantiated in several namespaces (e.g. `prod` and `staging` on different queues).
- Several workers may share a queue only if they register the **same** type set; the same type set on different queues is a tier the caller picks by queue.
- A call without an explicit `task_queue` goes to the caller's own queue; some worker there must register the target.
- Names are plain identifiers except the namespace name, nexus endpoint name, and endpoint reference, which take the `deploy_name` form (hyphens, `{param}` holes; `twf spec tokens-and-keywords`).

`twf check` enforces these — diagnostics in [common-errors.md](../reference/common-errors.md).

### Worker Options

The worker `options:` block is the **union of SDK worker options**, accepted permissively — the parser does no per-language validation. Use it for **strategy and intent**, not numeric ops tuning (exact poller counts and cache TTLs belong in implementation):

- **`task_queue`** (required) — routing; pins the worker pool.
- **`versioning: none | build_id | deployment`** — the pool's worker-versioning strategy, a reliability decision the design should make ([versioning.md](./versioning.md#declaring-the-strategy-in-twf)). Concrete Build IDs / deployment names are deploy-time inputs, not `.twf` content.
- **`enable_sessions`** — pins a sequence of activities to one worker (host affinity for stateful or resource-bound work); a design call, not tuning.
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

**Keep the queue set bounded.** A queue name built from a per-request value (`"request-{requestId}"`) creates queues that are never cleaned up; select from a fixed set instead (`"high"`, `"medium"`, `"low"`).

### Template holes vs. runtime interpolation

`{x}` in an option value means two different things by position:

| `{x}` position | Meaning | Bound by | Template check |
|----------------|---------|----------|----------------|
| **Workflow-body** activity/child-call option value — `"tenant-{tenantId}"`, `"workers-{request.region}"` | **Runtime interpolation** of a workflow parameter, per execution | The workflow's parameters, at runtime | **Not** subject to `UNBOUND_TEMPLATE_PARAM` |
| **Namespace name**, **endpoint name**, or a **namespace-level worker/endpoint** option value — `task_queue: "q-{org}-bootstrap"` under `namespace fabric-shard-{org}` | **Deploy-time template hole**, fixed per family member | The enclosing namespace/endpoint template | **Must** be bound, else `UNBOUND_TEMPLATE_PARAM` |

See [namespaces.md](../reference/namespaces.md#parameterized-namespaces-and-endpoints) for the family model.
