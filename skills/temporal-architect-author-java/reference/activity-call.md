# activity call

```twf
activity ValidateOrder(order) -> validated
```

```java
private final OrderActivities activities =
    Workflow.newActivityStub(
        OrderActivities.class,
        ActivityOptions.newBuilder().setStartToCloseTimeout(Duration.ofMinutes(1)).build());

ValidateResult validated = activities.validateOrder(order);
```

- The stub's method sends that method's wire name and blocks the workflow until the result (`workflow/Workflow.java:75`, `internal/sync/ActivityInvocationHandler.java:48-68`). The stub never runs the impl in the workflow, so its dependencies stay on the worker.
- A failed activity throws `ActivityFailure` (`failure/ActivityFailure.java:11`) from the call; let it propagate unless the `.twf` handles it.
- The stub carries the options ([options.md](./options.md)); calls sharing options share one stub, a field of the workflow impl.
- Bound to a promise, the call is `Promise<ValidateResult> p = Async.function(activities::validateOrder, order)` (`workflow/Async.java:28`), and `p.get()` is the `await` ([promise.md](./promise.md)).
- A `task_queue` with `{x}` parameters names one member of a worker family: set `setTaskQueue` from the family's queue method with the workflow's inputs, and set `setScheduleToStartTimeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
