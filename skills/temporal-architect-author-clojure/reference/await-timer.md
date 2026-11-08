# await timer

```twf
await timer(5m)
```

```clojure
(w/sleep (Duration/ofMinutes 5))
```

- `w/sleep` is sdk-java's `Workflow.sleep` and takes the `.twf` duration as a `java.time.Duration` (`src/temporal/workflow.clj:40-43`). A variable duration passes straight through: `(w/sleep backoff)`. Never `Thread/sleep`: [`doc/workflows.md` § Workflow Implementation Constraints](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#workflow-implementation-constraints).
- A cancelled workflow throws `CanceledFailure` from it ([author-java](../../temporal-architect-author-java/reference/await-timer.md)).
- As a `promise`, a timer is `(w/new-timer d)` (`src/temporal/workflow.clj:76-78`); as an inline race case it starts in a `CancellationScope` so a loss can cancel it, which `w/new-timer` cannot ([await-one.md](./await-one.md)).
