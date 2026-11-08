# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```clojure
(let [approves (arr/arrivals)]
  (s/register-signal-handler!
   (fn [signal-name args]
     (case signal-name
       "Approve" (do (reset! status "approved") (arr/add! approves args))
       nil)))
  ;; ... later in the body:
  (let [{:keys [approver]} (arr/take! approves)]
    ...))
```

Every signal or update the design waits on gets its own `(arr/arrivals)`, created in the `defworkflow` body before the handler that adds to it. The arrival is the handler's params map, destructured after the take, or `true` for no params. Copy the namespace from the corpus's [`messages/clojure/messages/arrivals.clj`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/clojure/messages/arrivals.clj) under the project's prefix; [`approval.clj`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/clojure/messages/approval.clj) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no arrivals.
- `take!` gives the oldest pending arrival, else waits for the next. Waiters are served in the order they began, by ticket, as the corpus's `arrivals-go-to-waiters-in-the-order-they-began` asserts. The runner is sdk-java's (`src/temporal/client/worker.clj:29-35`), so a bare wait per waiter serves thread-creation order: [author-java's await-signal.md](../../temporal-architect-author-java/reference/await-signal.md).
- Not the SDK's signal channel, `(s/<! ch "Approve")` over `s/create-signal-chan` (`src/temporal/signals.clj:34-47`): it is that bare wait per waiter, as the corpus's `the-sdk-signal-channel-serves-thread-order-not-wait-order` asserts, and it takes the workflow's one signal handler, so no handler body can run beside it ([signal-handler.md](./signal-handler.md)).
- `promise!` takes its ticket when called, so a promise begins waiting at its binding ([promise.md](./promise.md)).
- An `await one` case uses `begin!`, `ready?`, `claim!` and `leave!` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- A waiter cancelled through its `CancellationScope` leaves the queue (`take!`'s `finally`), as the corpus's `a-cancelled-waiter-leaves-the-queue` asserts.
- A signal with no params that only an `await one` waits on may count its arrivals in an atom instead, as the corpus's `Batch` does (`(swap! acks inc)`; `(pos? @acks)`; `(swap! acks dec)`).
- Code after `take!` sees current state, which later handlers may have changed; per-arrival data comes from the taken map.
