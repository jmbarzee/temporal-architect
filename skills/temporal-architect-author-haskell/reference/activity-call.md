# activity call

```twf
activity ValidateOrder(order) -> validated
```

```haskell
validated <- executeActivity validateOrder (defaultStartActivityOptions (StartToClose (minutes 1))) order
```

- `executeActivity activity options args…` (`Workflow.hs:517-526`) takes the `ProvidedActivity` value, so the SDK sends its registered name and the codec checks the args against its type; args are positional, one payload each. The definition's environment stays on the worker.
- A failed activity throws `ActivityFailure` from the call (`Workflow.hs:455-470`); let it propagate unless the `.twf` handles it. Uncaught, it fails the run with the activity failure as its cause (`WorkflowInstance.hs:956-980`).
- `StartActivityOptions` is the required second argument, and `defaultStartActivityOptions` requires a timeout ([options.md](./options.md#activity-options)); calls sharing options share one named value.
- Bound to a promise, the call is `startActivity` (`Workflow.hs:507-514`), which returns a `Task`; `wait` it for the result (`executeActivity` is exactly that pair).
- A `task_queue` with `{x}` parameters names one member of a worker family: set `taskQueue` from the family's queue function with the workflow's inputs, and set `scheduleToStartTimeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
