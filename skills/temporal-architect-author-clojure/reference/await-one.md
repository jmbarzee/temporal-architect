# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		status = "cancelled"
```

```clojure
(defn inline-timer
  "An inline timer case: started in a scope of its own, to be cancelled when it loses (spec 06)."
  [^Duration d]
  (let [^CompletablePromise p (Workflow/newPromise)
        scope (Workflow/newCancellationScope ^Runnable (fn [] (.completeFrom p (Workflow/newTimer d))))]
    (.run scope)
    {:promise p :scope scope}))

;; in the defworkflow body:
(let [payment (arr/begin! payments)
      {:keys [^Promise promise ^CancellationScope scope]} (inline-timer (Duration/ofHours 24))]
  (w/await #(or (arr/ready? payments payment) (.isCompleted promise)))
  (if (arr/ready? payments payment) ; listed first, so it wins a tie
    (do (arr/claim! payments)
        (.cancel scope) ; the inline timer lost
        (reset! status "processing"))
    (do (arr/leave! payments payment)
        @(a/invoke CancelOrder {:order-id order-id} activity-options)
        (reset! status "cancelled"))))
```

One `w/await` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Clojure needs no SDK opt-in for this shape: the runner is sdk-java's (`src/temporal/client/worker.clj:29-35`), which runs every handler of the workflow task before the predicate is read ([author-java's await-one.md](../../temporal-architect-author-java/reference/await-one.md)). The corpus's `concurrency/batch.clj` holds `inline-timer` and the `Batch` race; its `batch_test.clj` holds the tie (`await-one-the-first-listed-of-several-ready-cases-wins`), the losing timer's `TimerCanceled` (`batch-acknowledged`), and a bound deadline that survives the rounds it loses (`BoundDeadline`); `AwaitOne` in `messages/arrivals_test.clj` is the signal case above.

- **Not `temporal.promise/race`**: it is `Promise.anyOf` (`src/temporal/promise.clj:61-75`), which completes in callback order and can pick the timer over a signal listed first (`the-sdk-race-is-not-listed-order`).
- **Not the timed receive `(s/<! ch "PaymentReceived" d)`** either, unless the timer is listed first: it is `(w/await d pred)` (`src/temporal/signals.clj:41-44`), which reports the timeout at a tie (`the-sdk-timed-signal-receive-loses-a-tie-to-its-timer`).
- **A `w/await` predicate must return a boolean.** `w/await` hands it to sdk-java as a `Supplier` (`src/temporal/workflow.clj:27-38`), which unboxes the result, so `nil` throws and the workflow task retries forever. `arr/ready?` and `.isCompleted` return booleans; wrap anything else in `(boolean …)`.

## Cases

| Case | Before `w/await` | In the predicate | Winner |
|------|------------------|------------------|--------|
| signal, update | `(arr/begin! xs)` → ticket `t` | `(arr/ready? xs t)` | `(arr/claim! xs)`; every losing message case calls `(arr/leave! xs t)` |
| inline timer | `(inline-timer d)`, as above | `(.isCompleted promise)` | every other winner calls `(.cancel scope)` |
| activity, child workflow, promise | `p`, from `(a/invoke …)`, `(w/invoke …)` or the binding | `(p/done? p)` | `@p` |
| condition | — | `@cond` | — |
| nested `await all:` | `(tp/all [p q])` | `(p/done? all)` | `@all` |
| nexus | unsupported: the SDK has no Nexus API | | |

A message case waits without taking: `ready?` checks its arrivals ([await-signal.md](./await-signal.md)), and only the winner claims the arrival. A losing case must `leave!`, or it holds its place and blocks later waiters. The predicate only reads; `claim!` and `leave!` come after the await. promesa's `p/done?` is true once the promise completes (`src/temporal/internal/promise.clj:149`), a failed one included; the winner's deref throws it.

## Notes

- **Losing cases** (spec 06): a losing inline timer is cancelled through its scope, and history records `TimerCanceled`; `w/new-timer` has no scope of its own (`src/temporal/workflow.clj:52-78`), hence `inline-timer`. Leave losing inline activities and children running until the run ends, and never cancel a bound `promise` for losing a round: it starts outside any timer's scope. For a child's lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)).
- An empty case body → the winner's `claim!` or deref alone.
- Event-driven/entity workflows repeat the race in a `loop`, with a fresh `begin!` ticket per message case each iteration.
