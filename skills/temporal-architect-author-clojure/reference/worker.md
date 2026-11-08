# worker

```twf
@sdk(clojure, "src/orders/workers.clj")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```clojure
;; src/orders/workers.clj
(ns orders.workers
  "Each .twf worker's options map, shared by the worker process and the tests."
  (:require [orders.activities :refer [ChargePayment ValidateOrder]]
            [orders.payments :as payments]
            [orders.process-order :refer [ProcessOrder]]
            [orders.validator :as validator]
            [temporal.client.core :as c]
            [temporal.client.worker :as worker]))

;; worker orderTypes
(def order-types
  {:task-queue "orders"
   :dispatch   {:workflows  [ProcessOrder]
                :activities [ValidateOrder ChargePayment]}})

(defn -main [& _]
  (let [client (c/create-client {:target "127.0.0.1:7233" :namespace "default"})]
    (worker/start client (assoc order-types :ctx {:payments (payments/create) :validator (validator/create)}))))
```

## Registration

- Each `.twf` worker is one options map in `workers.clj`, named for the worker (`order-types`), with an explicit `:dispatch` of its `defworkflow` and `defactivity` vars. Without `:dispatch`, every `defworkflow` and `defactivity` loaded in the JVM registers on that worker, and two with one name anywhere throw (`src/temporal/client/worker.clj:19-26`, `src/temporal/internal/utils.clj:46-84`). The `.twf` worker's `@sdk(clojure, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `worker/start client opts factory-opts?` makes a `WorkerFactory` of its own, one worker on `:task-queue`, registers the dispatch, starts the factory, and returns `{:factory … :worker …}` (`src/temporal/client/worker.clj:168-188`). The namespace is the client's `:namespace` (`src/temporal/client/options.clj:33`). Several `.twf` `worker` blocks are several `worker/start` calls, each on its own factory.
- `:ctx` carries the activities' dependencies, built by the process ([activity-def.md](./activity-def.md)); a test `assoc`s its own. A test starts the same map on its environment with `e/start` (`src/temporal/testing/env.clj:64-84`).
- Connecting, running and hot reload: [`doc/workers.md` § How to start a Worker](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workers.md#how-to-start-a-worker).

A missing registration is an unregistered type: the worker starts, and the task fails at runtime with `workflow/activity not found` (`src/temporal/internal/utils.clj:86-90`).

**Nexus.** Unsupported: the SDK has no Nexus API ([nexus-service-def.md](./nexus-service-def.md)). A `.twf` worker that registers a Nexus service is written in another SDK.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `:schedule-to-start-timeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

## Per-instance worker families

A `{param}` in a worker's `task_queue` is a family: one worker per instance, each polling its own queue ([task-queues.md](../../temporal-architect-design/topics/task-queues.md#per-instance-worker-families)).

```twf
workflow Agent(task: Task, lease: Lease) -> (ToolOutput):
	activity RunTool(task.call) -> output
		options:
			task_queue: "sandbox-{lease.sandboxId}"
			schedule_to_start_timeout: 30s
			start_to_close_timeout: 5m
	close complete(output)

namespace aivearium:
	worker sidecar
		options:
			task_queue: "sandbox-{sandboxId}"
			worker_identity: "sidecar-{sandboxId}"
			max_concurrent_activity_task_pollers: 2
```

```clojure
;; One queue function per family, shared by the instance process and every caller.
(defn sandbox-queue [sandbox-id]
  (str "sandbox-" sandbox-id))

;; In the sidecar process, one per instance:
(worker/start (c/create-client {:namespace "aivearium" :identity (str "sidecar-" sandbox-id)})
              (assoc sidecar
                     :task-queue (sandbox-queue sandbox-id)
                     :max-concurrent-activity-task-pollers 2))

;; In Agent:
@(a/invoke RunTool {:call (:call task)}
           {:task-queue                (sandbox-queue (:sandbox-id lease))
            :schedule-to-start-timeout (Duration/ofSeconds 30)
            :start-to-close-timeout    (Duration/ofMinutes 5)})
```

- **The instance process starts its own worker,** one per instance. The family's workflows stay on a shared-queue worker.
- **Set `:max-concurrent-activity-task-pollers` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **Identity is the client's `:identity`,** `pid@hostname` when unset ([author-java](../../temporal-architect-author-java/reference/worker.md#per-instance-worker-families)): one client per member gives each its own.
- **The call sets `:task-queue`, `:schedule-to-start-timeout` and `:start-to-close-timeout`.** A schedule-to-start timeout is not retried; it arrives as a `TimeoutFailure` cause of the `ActivityFailure` the deref throws ([author-java](../../temporal-architect-author-java/reference/worker.md#per-instance-worker-families)).

## Worker options

The namespace worker's `options:` block maps onto the `worker/start` options map, whose keys call the `WorkerOptions.Builder` setter of the same name (`src/temporal/client/worker.clj:139-162`), except where noted. No key is inverted or in other units: each rate is a number per second, each duration a `Duration`.

| TWF worker option | Clojure |
|-------------------|---------|
| `task_queue` | `:task-queue` (required) |
| `worker_activity_rate_limit` | `:max-workers-activities-per-second` (renamed) |
| `task_queue_activity_rate_limit` | `:max-taskqueue-activities-per-second` (renamed) |
| `max_concurrent_activity_executions` | `:max-concurrent-activity-execution-size` (renamed) |
| `max_concurrent_workflow_task_executions` | `:max-concurrent-workflow-task-execution-size` (renamed) |
| `max_concurrent_local_activity_executions` | `:max-concurrent-local-activity-execution-size` (renamed) |
| `max_concurrent_nexus_task_executions` | `:max-concurrent-nexus-execution-size` (renamed); moot without Nexus |
| `max_concurrent_workflow_task_pollers` | `:max-concurrent-workflow-task-pollers` |
| `max_concurrent_activity_task_pollers` | `:max-concurrent-activity-task-pollers` |
| `max_concurrent_nexus_task_pollers` | `:max-concurrent-nexus-task-pollers`; moot without Nexus |
| `max_cached_workflows` | **not a worker key**: the factory option `:workflow-cache-size`, `worker/start`'s third argument (`:46,55`). The cache is the factory's, and each `worker/start` has its own, so the value is per worker |
| `sticky_schedule_to_start_timeout` | **no key**: interop, below |
| `max_heartbeat_throttle_interval` | `:max-heartbeat-throttle-interval` |
| `worker_identity` | **not a worker key**: the client's `:identity` (`src/temporal/client/options.clj:32`); per worker on one client, interop below |
| `worker_shutdown_timeout` | **not an option**: `worker/stop` only calls `shutdown` (`:190-205`); then `(.awaitTermination (:factory instance) timeout TimeUnit/SECONDS)` (`worker/WorkerFactory.java:513`) |
| `local_activity_only_mode: true` | `:local-activity-worker-only true` (renamed, not inverted) |
| `versioning` | **no key**: interop, below |

The worker-wide `:disable-eager-execution` (inverted) is an activity's `request_eager_execution: false` ([options.md](./options.md#activity-options)).

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			max_cached_workflows: 1000
			worker_shutdown_timeout: 30s
```

```clojure
(let [instance (worker/start client
                             (assoc order-types :max-concurrent-activity-execution-size 50)
                             {:workflow-cache-size 1000})]
  ;; On shutdown:
  (worker/stop instance)
  (.awaitTermination ^WorkerFactory (:factory instance) 30 TimeUnit/SECONDS))
```

### Interop: sticky timeout, identity, versioning

The options map has no key for `setStickyQueueScheduleToStartTimeout`, `setIdentity`, `setBuildId` or `setDeploymentOptions` (`worker/WorkerOptions.java:386,448,528,537`), and `worker/start` builds `WorkerOptions` from the map alone. So such a worker builds its own factory and options, and registers the dispatch with `worker/init`, public though marked `^:no-doc` (`src/temporal/client/worker.clj:15-35`), which reads only `:ctx` and `:dispatch` from the map; every other option goes on the builder:

```clojure
(let [factory (WorkerFactory/newInstance client)
      w       (.newWorker factory "orders"
                          (-> (WorkerOptions/newBuilder)
                              (.setStickyQueueScheduleToStartTimeout (Duration/ofSeconds 10))
                              (.setMaxConcurrentActivityExecutionSize 50)
                              (.build)))]
  (worker/init w (assoc order-types :ctx ctx))
  (.start factory))
```

`versioning` carries strategy, not identifiers: the Build ID and deployment name are deploy-time inputs from config or env, never fabricated into code. `none` sets nothing; `build_id` and `deployment` set the builder exactly as [author-java's `versioning`](../../temporal-architect-author-java/reference/worker.md#versioning-not-11) shows.
