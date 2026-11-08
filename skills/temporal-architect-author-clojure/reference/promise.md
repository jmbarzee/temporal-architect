# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (deref at once, `@(a/invoke …)`); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```clojure
(let [handle-a (a/invoke ProcessA {:items (:a items)} activity-options)
      ;; ... do other work ...
      result-a @handle-a]
  ...)
```

| `promise p <- …` | Clojure |
|------------------|---------|
| `activity` | `(a/invoke Activity params opts)`, already started (`src/temporal/activity.clj:137-188`) |
| `workflow` | `(w/invoke Child params opts)`, already started (`src/temporal/workflow.clj:246-321`); a child the design also signals: [signal-send.md](./signal-send.md) |
| `timer(5m)` | `(w/new-timer (Duration/ofMinutes 5))` (`src/temporal/workflow.clj:52-78`) |
| `nexus …` | unsupported: the SDK has no Nexus API |
| `signal Approve` / `update Review` | `(arr/promise! approves)` |

- Each is a promesa-compatible `PromiseAdapter` over sdk-java's `Promise` (`src/temporal/internal/promise.clj:14-16`): `@p` blocks for the result and throws a failure. A failed promise never read: [author-java's promise.md](../../temporal-architect-author-java/reference/promise.md). Safe and unsafe promise use: [`doc/workflows.md` § Promises](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#promises).
- A promise on a signal or update begins waiting at its binding, not at its deref: `promise!` takes its ticket from the message's arrivals, then waits on a workflow thread of its own through `Async/function` interop, since the SDK wraps no `Async` ([await-signal.md](./await-signal.md)), as the corpus's `(arr/promise! approves)` does and its `a-promise-begins-waiting-at-its-binding` asserts. Not `Async/function` over `take!`: the new thread first runs once the current one blocks, so its ticket would be late ([author-java's promise.md](../../temporal-architect-author-java/reference/promise.md)).
- In `await one:`, a promise is a `(p/done? p)` case ([await-one.md](./await-one.md#cases)). Losing a round never cancels it, a `timer` promise included: it is bound outside any scope a race cancels, and stays awaitable (spec 06), as the corpus's `a-bound-promise-survives-the-rounds-it-loses` asserts.
