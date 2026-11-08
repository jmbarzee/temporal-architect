# options

Options are plain maps of kebab-case keys, each mapped to one sdk-java builder setter of the same name; the setter's semantics are author-java's ([options.md](../../temporal-architect-author-java/reference/options.md)). A duration is a `java.time.Duration` (`2m` → `(Duration/ofMinutes 2)`), never a number of milliseconds. `retry_policy:` → `:retry-options`, a map on `RetryOptions`'s defaults (`src/temporal/common.clj:9-27`): `initial_interval` → `:initial-interval`, `backoff_coefficient` → `:backoff-coefficient`, `maximum_interval` → `:maximum-interval`, `maximum_attempts` → `:maximum-attempts`, `non_retryable_error_types` → `:do-not-retry` (renamed), a vector of strings. `priority:` → `:priority` (`:29-43`): `priority_key` → `:priority-key`, `fairness_key` → `:fairness-key`, `fairness_weight` → `:fairness-weight`.

**A bad option fails silently.** Every map goes through `u/build`, which skips an unknown key with only a trace log, and on any exception — a number where a `Duration` belongs, a keyword where a `String` belongs, an unknown policy keyword — logs an error and returns `nil` (`src/temporal/internal/utils.clj:21-32`). The whole map is then dropped and the call or worker runs on sdk-java's defaults (`activity/ActivityOptions.java:54-57`, `workflow/ChildWorkflowOptions.java:67-70`, `worker/WorkerOptions.java:94-97`). There is no typo protection: check each key against the tables below, and the logs for `u/build` errors.

**Options live on the call.** `a/invoke` and `w/invoke` take the options map as their third argument and build a fresh stub from it (`src/temporal/activity.clj:178-181`, `src/temporal/workflow.clj:311-314`); calls sharing options share one map.

## Activity options

```twf
activity UnreliableService(data) -> result
	options:
		start_to_close_timeout: 2m
		retry_policy:
			maximum_attempts: 5
			initial_interval: 1s
			backoff_coefficient: 2.0
			maximum_interval: 60s
```

```clojure
(def unreliable-service-options
  {:start-to-close-timeout (Duration/ofMinutes 2)
   :retry-options          {:maximum-attempts    5
                            :initial-interval    (Duration/ofSeconds 1)
                            :backoff-coefficient 2.0
                            :maximum-interval    (Duration/ofSeconds 60)}})

(let [result @(a/invoke UnreliableService {:data data} unreliable-service-options)]
  …)
```

**With neither close timeout, the SDK sets `:start-to-close-timeout` to 3 s**, a default sdk-java does not have (`src/temporal/internal/activity.clj:34-38`). Always set one, even with no `options:` anywhere.

| TWF | `a/invoke` key (`src/temporal/internal/activity.clj:23-32`) |
|-----|---------------------|
| `task_queue` | `:task-queue`, a `String` only: unlike the child and worker keys it skips `namify`, so a keyword drops the map |
| `schedule_to_close_timeout` | `:schedule-to-close-timeout` |
| `schedule_to_start_timeout` | `:schedule-to-start-timeout` |
| `start_to_close_timeout` | `:start-to-close-timeout` (3 s when neither close timeout is set) |
| `heartbeat_timeout` | `:heartbeat-timeout` |
| `retry_policy` | `:retry-options` (renamed) |
| `priority` | `:priority` |
| `request_eager_execution: false` | **no key**: `ActivityOptions.setDisableEagerExecution` (`activity/ActivityOptions.java:218`) is not wrapped. The worker-wide `:disable-eager-execution true` (inverted) turns it off for every activity its workflows schedule |
## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```clojure
(let [child-result @(w/invoke ChildWorkflow {:data (:data input)}
                              {:workflow-execution-timeout (Duration/ofHours 1)
                               :parent-close-policy        :request-cancel
                               :retry-options              {:maximum-attempts 3}})]
  …)
```

| TWF | `w/invoke` key (`src/temporal/internal/child_workflow.clj:20-35`) |
|-----|-----------------------|
| `task_queue` | `:task-queue` |
| `workflow_execution_timeout` | `:workflow-execution-timeout` |
| `workflow_run_timeout` | `:workflow-run-timeout` |
| `workflow_task_timeout` | `:workflow-task-timeout` |
| `workflow_id_reuse_policy` | `:workflow-id-reuse-policy`: `:allow-duplicate`, `:allow-duplicate-failed-only` or `:reject-duplicate` (`src/temporal/internal/workflow.clj:27-44`) |
| `retry_policy` | `:retry-options` (renamed) |
| `priority` | `:priority` |
| `parent_close_policy` | `:parent-close-policy`: `:terminate`, `:request-cancel` or `:abandon` (`:15-18`). An unknown keyword is `nil`, which leaves the server's default, terminate |

`:cancellation-type` (`:abandon`, `:try-cancel`, `:wait-cancellation-completed`, `:wait-cancellation-requested`, `:9-13`) belongs to [detach](./detach.md) alone. `:workflow-id` is the ID function's value ([workflow-def.md](./workflow-def.md#id_scheme)).

A client start's map, for `c/create-workflow`, uses the same keys less `:parent-close-policy` and `:cancellation-type`, plus `:workflow-id-conflict-policy` (`src/temporal/internal/workflow.clj:63-78`).

## Nexus operation options

Unsupported: the SDK has no Nexus API ([nexus.md](./nexus.md)).

## Definition-level `default_options:`

A `default_options:` block on an `activity` or `workflow` definition supplies defaults for every call of it; a call site's `options:` overrides per key, and a nested block (`retry_policy`, `priority`) replaces the default whole (`twf spec statement-syntax`, Definition Default Options). `parent_close_policy` is call-site only.

```twf
activity ChargeCard(card, amount) -> receipt
	default_options:
		start_to_close_timeout: 30s
		retry_policy:
			maximum_attempts: 5
```

One options map beside the definition is that rule, and `merge` is the override: it replaces a key whole, so a nested block replaces the default's.

```clojure
(def charge-card-defaults
  {:start-to-close-timeout (Duration/ofSeconds 30)
   :retry-options          {:maximum-attempts 5}})

@(a/invoke ChargeCard {:card card :amount amount} charge-card-defaults)
@(a/invoke ChargeCard {:card card :amount tip} (merge charge-card-defaults {:retry-options {:maximum-attempts 1}}))
```

Never a deep merge (`merge-with merge`): that merges a nested block key by key.

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `:workflow-id-reuse-policy :allow-duplicate`; `workflow_id_conflict_policy` → `:workflow-id-conflict-policy :use-existing` (`:fail`, `:use-existing`, `:terminate-existing`; `src/temporal/internal/workflow.clj:46-61`). Where each lands depends on the start kind:

- **Client start** (client code): both, in the type's start-options map ([workflow-def.md](./workflow-def.md#id_scheme)). A conflict under `:fail` throws from `c/start` ([author-java](../../temporal-architect-author-java/reference/options.md#workflow-id-policies)).
- **Child start**: `w/invoke` has no conflict key, so it takes the reuse policy only; a start onto a running ID fails the child's promise ([author-java](../../temporal-architect-author-java/reference/options.md#workflow-id-policies)).

## Worker options

A namespace worker's `options:` map in [worker.md](./worker.md#worker-options).

## Timeouts and retries

[author-java's options.md](../../temporal-architect-author-java/reference/options.md#timeouts-and-retries).
