# update handler

```twf
update ChangePlan(newPlan: string) -> (ChangeResult):
	activity ValidatePlan(newPlan) -> validation
	if (validation.valid):
		plan = newPlan
		return ChangeResult{success: true, plan: plan}
	else:
		return ChangeResult{success: false, error: validation.reason}
```

```clojure
;; in the defworkflow body:
(w/register-update-handler!
 (fn [update-type args]
   (try+ ; clj-commons.slingshot
    (case update-type
      :ChangePlan (let [{:keys [new-plan]} args
                        {:keys [valid reason]} @(a/invoke ValidatePlan {:new-plan new-plan} activity-options)]
                    (if valid
                      (do (reset! plan new-plan) {:success true :plan @plan})
                      {:success false :error reason})))
    (catch Object _
      (ex/forward &throw-context)))) ; ex: temporal.internal.exceptions
 {:validator (fn [update-type _]
               (when-not (#{:ChangePlan} update-type)
                 (throw (IllegalArgumentException. (str "unknown update " (name update-type))))))})
```

- **One** `w/register-update-handler!` per workflow, dispatching every update by `case` on its keyword name (`src/temporal/workflow.clj:140-202`, `:193`). It registers sdk-java's one dynamic update handler, and a second registration silently replaces the first (sdk-java `internal/sync/UpdateDispatcher.java:125-127`).
- The `:validator` names every update the workflow declares and throws for any other, so an unknown name is rejected to its caller (`src/temporal/workflow.clj:197-202`); the workflow runs on, as the corpus's `an-unknown-update-is-rejected-by-the-validator` asserts. A validator only reads: no state change, no blocking call (`src/temporal/workflow.clj:168-169`).
- Params travel as one map, none as `{}`, as for a [signal](./signal-handler.md) (#438).
- Unlike a query, the handler may call activities, children and timers, and may mutate workflow state. It cannot `close` the workflow. Its return value is the caller's result.
- A failure the body leaves uncaught, such as an `await all` branch's, fails only this update, and the run goes on, but only through the `try+`. sdk-java fails the update for a `TemporalFailure` (`internal/sync/WorkflowExecutionHandler.java:136`, `internal/sync/SyncWorkflow.java:183-184`) and the workflow task for anything else (`WorkflowExecutionHandler.java:145`). A call that fails with a stone, which a callee's `throw+` or `ex-info` becomes (`src/temporal/internal/activity.clj:121-128`, `src/temporal/internal/exceptions.clj:31-38`; slingshot 0.13.0 `support.clj:41-49`), is rethrown as that stone (`src/temporal/activity.clj:185`, `src/temporal/workflow.clj:318`), and `w/register-update-handler!` converts nothing (`src/temporal/workflow.clj:192-196`). `forward`, which the SDK runs over the workflow body (`src/temporal/internal/workflow.clj:106,119-121`), re-casts a stone as an `ApplicationFailure` and rethrows anything else; no public function does. The corpus's `a-branch-failure-in-an-update-fails-only-that-update` asserts it.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's arrivals with `arr/add!` just before it returns, after its last blocking call: `(do (reset! status "reviewed") (arr/add! reviews args) @status)` ([await-signal.md](./await-signal.md)). The caller gets its result then, before any waiter takes the arrival, as the corpus's `review-caller-gets-its-result-before-any-waiter-takes-it` asserts.
- Before the workflow returns or continues as new, `(w/await w/every-handler-finished?)` (`src/temporal/workflow.clj:495-532`), so an in-flight update is not abandoned: [`doc/workflows.md` § Ensuring Handlers Complete Before Workflow Ends](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#ensuring-handlers-complete-before-workflow-ends). Handlers that block and share state: [§ Coordinating Concurrent Handlers](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#coordinating-concurrent-handlers).
- `unfinished_policy` and `description`: `w/register-update-handler!` keeps sdk-java's defaults (`src/temporal/workflow.clj:190-202`), so a design that sets either registers its own `DynamicUpdateHandler` (`handleExecute`, `handleValidate`, `getUnfinishedPolicy`, `getDescription`; sdk-java `workflow/DynamicUpdateHandler.java:20-33`) through `Workflow/registerListener`, mapped as for a [signal](./signal-handler.md#handler-options).
