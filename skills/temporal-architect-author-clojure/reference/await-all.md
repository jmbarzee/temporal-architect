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
- `tp/all` fails at the first failure (`src/temporal/promise.clj:18`); the other branches keep running. To cancel them, start the branches in a `CancellationScope` through interop and cancel it on failure: [author-java's await-all.md](../../temporal-architect-author-java/reference/await-all.md). `tp/all-settled` waits for every branch (`src/temporal/promise.clj:33-59`).
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
