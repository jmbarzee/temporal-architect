# await all

```twf
await all:
	activity Count(items) -> count
	workflow Audit(items) -> audited
```

```clojure
(let [[cnt audited] @(tp/all [(a/invoke Count {:items items} activity-options)
                              (w/invoke Audit {:items items})])]
  ...)
```

- One `@(tp/all [...])` over every branch's [promise](./promise.md), whatever its kind; it yields the results as a vector in branch order (`src/temporal/promise.clj:15-31`), as the corpus's `Batch` destructures `[cnt audited]`.
- `tp/all` is sdk-java's `Promise/allOf` over the branches (`src/temporal/promise.clj:28-31`), which fails at the first branch failure, with that failure, and cancels nothing (sdk-java `internal/sync/AllOfPromise.java:33-53`): the other branches keep running, as spec 06 requires. When two fail, the first to fail surfaces; a later failure is dropped (`AllOfPromise.java:41-45`). Not `tp/all-settled`, which waits for every branch (`src/temporal/promise.clj:49-59`).
- `allOf` skips a branch already complete (`AllOfPromise.java:34`), and `tp/all` reads it only once the rest succeed (`src/temporal/promise.clj:30-31`), so a branch that failed before `tp/all` was built surfaces late. Build it straight after the branches start, with no blocking call between, in both forms.
- Left uncaught, the failure fails the run from the body (`src/temporal/internal/workflow.clj:119-121`), and only the update from an [update handler](./update-handler.md), through its `try+`. The corpus's `failure.job-test` asserts both.
- A `detach workflow` branch is complete once started: its branch is `(p/promise (.getExecution stub))` on the child stub, which resolves at the start (`src/temporal/internal/promise.clj:126-128` wraps it for `tp/all`; the stub: [detach.md](./detach.md)).
- A `nexus` branch is unsupported: the SDK has no Nexus API.

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```clojure
@(tp/all (mapv #(a/invoke ProcessBatchItem {:item %} activity-options) items))
```
