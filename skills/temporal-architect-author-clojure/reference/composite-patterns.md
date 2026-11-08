# composite patterns

Bugs cluster where patterns combine. Two worked compositions:

## Pattern 1: Update handler + condition + await one (HumanReview)

An update handler sets a condition that races against a timer in an `await one`: "approve within the deadline, or auto-escalate."

### DSL

```twf
workflow HumanReview(docId: string) -> (ReviewResult):
	state:
		condition reviewComplete

	update SubmitReview(decision: string) -> (ReviewResult):
		result = decision
		set reviewComplete
		return ReviewResult{decision: result}

	await one:
		reviewComplete:
			close complete(ReviewResult{decision: result})
		timer(48h):
			activity Escalate(docId)
			close complete(ReviewResult{decision: "escalated"})
```

### Clojure

```clojure
(defworkflow HumanReview
  [{:keys [doc-id]}]
  (let [review-complete (atom false)
        result          (atom "")]
    (w/register-update-handler!
     (fn [update-type {:keys [decision]}]
       (case update-type
         :SubmitReview (do (reset! result decision)
                           (reset! review-complete true)
                           {:decision @result})))
     {:validator (fn [update-type _]
                   (when-not (#{:SubmitReview} update-type)
                     (throw (IllegalArgumentException. (str "unknown update " (name update-type))))))})
    (let [{:keys [^Promise promise ^CancellationScope scope]} (inline-timer (Duration/ofHours 48))]
      (w/await #(or @review-complete (.isCompleted promise)))
      (if @review-complete ; listed first, so it wins a tie
        (.cancel scope) ; the inline timer lost
        (do @(a/invoke Escalate {:doc-id doc-id} activity-options)
            (reset! result "escalated"))))
    (w/await w/every-handler-finished?)
    {:decision @result}))
```

### Why this is tricky

1. **The condition is read, not taken**: it is an atom in the predicate; nothing waits on the update itself, so it needs no arrivals ([await-one.md](./await-one.md#cases))
2. **Not `(w/await (Duration/ofHours 48) #(deref review-complete))`**: at a tie it reports the timeout, so the timer wins although the condition is listed first ([await-one.md](./await-one.md))
3. **The losing timer is cancelled**: spec 06 cancels a losing inline timer, so it starts in its own scope through `inline-timer`; a losing activity or child case would keep running ([await-one.md](./await-one.md#notes))
4. **`(w/await w/every-handler-finished?)` before returning**, so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

## Pattern 2: Signal-set condition vs timer with a shared tail (ManageRetention)

A retention timer races a cancellation signal.

```twf
workflow ManageRetention(docId: string, retentionDays: int):
	state:
		condition cancelled

	signal CancelRetention():
		set cancelled

	await one:
		cancelled:
			activity DeleteDocument(docId)
			close complete
		timer(retentionDays * 24h):
			activity DeleteDocument(docId)
			close complete
```

The Clojure race is Pattern 1's, with the signal handler (`(s/register-signal-handler! (fn [signal-name _] (case signal-name "CancelRetention" (reset! cancelled true) nil)))`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `(inline-timer (Duration/ofDays retention-days))` ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `DeleteDocument` call after the race rather than one per case
