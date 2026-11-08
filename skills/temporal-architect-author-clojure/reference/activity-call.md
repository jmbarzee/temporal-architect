# activity call

```twf
activity ValidateOrder(order) -> validated
```

```clojure
(def validate-options {:start-to-close-timeout (Duration/ofMinutes 1)})

(let [validated @(a/invoke ValidateOrder {:order order} validate-options)]
  …)
```

- `a/invoke` sends the var's registered name with the params map as its one payload and returns a promise; `@` blocks the workflow until the result (`src/temporal/activity.clj:178-188`). It never runs the body in the workflow, so the activity's `:ctx` stays on the worker.
- **Always pass an options map with a close timeout.** With neither `:start-to-close-timeout` nor `:schedule-to-close-timeout`, the SDK sets a 3 s start-to-close timeout silently (`src/temporal/internal/activity.clj:34-38`); keys in [options.md](./options.md#activity-options).
- A failed activity throws from the deref: a slingshot stone the activity threw is rethrown as that stone, for `try+` (`src/temporal/activity.clj:185`, `src/temporal/internal/exceptions.clj:40-43`); anything else is sdk-java's `ActivityFailure` ([author-java](../../temporal-architect-author-java/reference/activity-call.md)). Let it propagate unless the `.twf` handles it.
- Bound to a promise, the call is the undereferenced `(a/invoke …)`; `@p` is the `await` ([promise.md](./promise.md)).
- A `task_queue` with `{x}` parameters names one member of a worker family: set `:task-queue` from the family's queue function with the workflow's inputs, and set `:schedule-to-start-timeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
