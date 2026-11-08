# signal handler

```twf
workflow Approval(request: string) -> (Decision):
	state:
		status = "submitted"
	signal Open():
		status = "open"
	signal Approve(approver: string):
		status = "approved"
```

```clojure
(defworkflow Approval
  [{:keys [request]}]
  (let [status   (atom "submitted")
        opens    (arr/arrivals) ; only if the design waits on it
        approves (arr/arrivals)]
    (s/register-signal-handler!
     (fn [signal-name args]
       (case signal-name
         "Open"    (do (reset! status "open") (arr/add! opens true))
         "Approve" (do (reset! status "approved") (arr/add! approves args))
         nil)))
    ;; ... the body
    ))
```

- **One** `s/register-signal-handler!` per workflow, dispatching every signal by its wire name with `case` (`src/temporal/signals.clj:56-80`). It registers sdk-java's one dynamic signal handler (`src/temporal/internal/signals.clj:24-30`), and a second registration silently replaces the first (sdk-java `internal/sync/SignalDispatcher.java:130-132`). The handler receives the name as the sender's string (the SKILL's Wire names); the `nil` default ignores any other name.
- Params travel as one value, the sender's first payload (`src/temporal/internal/utils.clj:146-150`): several params are one map keyed by param name, destructured as `{:keys [approver]}`, and no params is `{}`, never `nil` (#438; [signal-send.md](./signal-send.md)).
- Register at the top of the `defworkflow` body, after the atoms it closes over and before the first blocking call. A signal that arrives earlier is buffered and replayed at registration (sdk-java `internal/sync/SignalDispatcher.java:77-80,133-137`).
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival with `arr/add!` ([await-signal.md](./await-signal.md)); no params adds `true`. A body that blocks (a timer, an activity) adds after its last blocking call: the arrival is pending only once the handler returns. A signal nothing waits on needs no arrivals.

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```clojure
;; in the defworkflow body, in place of s/register-signal-handler!:
(Workflow/registerListener
 (reify DynamicSignalHandler
   (handle [_ signal-name args]
     (let [_args (.get ^EncodedValues args (int 0) Object)] ; the params map
       (case signal-name
         "Cancel" (reset! cancelled true)
         nil)))
   (getUnfinishedPolicy [_ signal-name]
     (case signal-name
       "Cancel" HandlerUnfinishedPolicy/ABANDON
       HandlerUnfinishedPolicy/WARN_AND_ABANDON))
   (getDescription [_] "Cancels the subscription")))
```

- `s/register-signal-handler!` keeps sdk-java's defaults (`src/temporal/internal/signals.clj:26-30`), so a design that sets either option registers its own `DynamicSignalHandler` through interop, reading the payload as the SDK does (`src/temporal/internal/utils.clj:146-150`).
- `unfinished_policy` is per name, through `getUnfinishedPolicy`: `abandon` → `HandlerUnfinishedPolicy/ABANDON`; `warn_and_abandon` → `WARN_AND_ABANDON`, the default (sdk-java `workflow/DynamicSignalHandler.java:22-24`).
- `description` is one string for the whole handler (`workflow/DynamicSignalHandler.java:27-29`), UI/CLI text with no runtime behavior: join several signals' descriptions into it.
