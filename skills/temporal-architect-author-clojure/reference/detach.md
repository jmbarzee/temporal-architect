# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Clojure that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow Archive(items)
```

```clojure
(ns batches.detach
  (:import [io.temporal.api.enums.v1 ParentClosePolicy]
           [io.temporal.workflow ChildWorkflowCancellationType ChildWorkflowOptions ChildWorkflowStub
            Promise Workflow]))

(defn detach-workflow!
  "Starts workflow-type, abandoned on the caller's close and cancellation, and waits only for its start."
  [^String workflow-type params]
  (let [^ChildWorkflowStub stub
        (Workflow/newUntypedChildWorkflowStub
         workflow-type
         (-> (ChildWorkflowOptions/newBuilder)
             (.setParentClosePolicy ParentClosePolicy/PARENT_CLOSE_POLICY_ABANDON)
             (.setCancellationType ChildWorkflowCancellationType/ABANDON)
             (.build)))]
    (.executeAsync stub Object (into-array Object [params]))
    ;; Resolves once the child has started; a failed start throws here.
    (.get ^Promise (.getExecution stub))))

(detach-workflow! "Archive" {:items items})
```

- `w/invoke` returns only the result promise, with no handle on the start (`src/temporal/workflow.clj:311-321`), so the start goes through sdk-java's untyped child stub. Its `ChildWorkflowOptions` set `PARENT_CLOSE_POLICY_ABANDON`, so the caller's close does nothing to the child (`workflow/ChildWorkflowOptions.java:228`), and `ChildWorkflowCancellationType/ABANDON`, so the caller's cancellation is never requested of it (`workflow/ChildWorkflowOptions.java:278`, `workflow/ChildWorkflowCancellationType.java:33`). `.executeAsync` starts it without blocking; `.getExecution` resolves at the child's start, and a failed start throws from it, failing the caller (`workflow/ChildWorkflowStub.java:43-48`). The type is the `.twf` name as a string, and the params are one map, as `w/invoke` sends them (`src/temporal/internal/utils.clj:141-144`). This is the corpus's `detach-workflow!`.
- Not `(w/invoke Archive params {:parent-close-policy :abandon :cancellation-type :abandon})` never dereferenced: it abandons the child, but nothing waits for the start, so a failed start goes unseen.
- A client start just starts: `(c/start (c/create-workflow client Archive opts) params)` returns once the run is started (`src/temporal/client/core.clj:112-117`), and nothing reads the result. Clojure has no Nexus handler, so no `.twf` body makes a client start.

```twf
detach nexus GreeterEndpoint GreeterService.Greet(friend)
```

`detach nexus` is unsupported: the SDK has no Nexus API ([nexus.md](./nexus.md)).
