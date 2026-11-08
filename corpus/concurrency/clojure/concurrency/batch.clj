(ns concurrency.batch
  (:require [temporal.activity :as a :refer [defactivity]]
            [temporal.promise :as tp]
            [temporal.signals :as s]
            [temporal.workflow :as w :refer [defworkflow]])
  (:import [io.temporal.api.enums.v1 ParentClosePolicy]
           [io.temporal.workflow CancellationScope ChildWorkflowCancellationType ChildWorkflowOptions
            ChildWorkflowStub CompletablePromise Promise Workflow]
           [java.time Duration]))

(def activity-options {:start-to-close-timeout (Duration/ofMinutes 1)})

;; Activity types are the var names: Count, Store. An activity takes (ctx, one argument).
(defactivity Count [_ {:keys [items]}]
  (count items))

(defactivity Store [_ _]
  nil)

(defworkflow Audit
  [{:keys [items]}]
  (pos? (count items)))

(defworkflow Archive
  [{:keys [items]}]
  @(a/invoke Store {:items items} activity-options)
  nil)

(defn detach-workflow!
  "detach workflow: abandon the child at parent close, never request its cancellation, and wait
  only for its start (a failed start throws here). temporal.workflow/invoke returns only the
  result promise, so the start is reached through the untyped child stub."
  [^String workflow-type params]
  (let [^ChildWorkflowStub stub
        (Workflow/newUntypedChildWorkflowStub
         workflow-type
         (-> (ChildWorkflowOptions/newBuilder)
             (.setParentClosePolicy ParentClosePolicy/PARENT_CLOSE_POLICY_ABANDON)
             (.setCancellationType ChildWorkflowCancellationType/ABANDON)
             (.build)))]
    (.executeAsync stub Object (into-array Object [params]))
    (.get ^Promise (.getExecution stub))))

(defn inline-timer
  "An inline timer case: started in a scope of its own, to be cancelled when it loses (spec 06)."
  [^Duration d]
  (let [^CompletablePromise p (Workflow/newPromise)
        scope (Workflow/newCancellationScope ^Runnable (fn [] (.completeFrom p (Workflow/newTimer d))))]
    (.run scope)
    {:promise p :scope scope}))

(defworkflow Batch
  [{:keys [items]}]
  (let [status (atom "unacknowledged")
        acks   (atom 0)] ; pending arrivals of Ack
    (s/register-signal-handler!
     (fn [signal-name _]
       (when (= "Ack" signal-name)
         (reset! status "acknowledged")
         (swap! acks inc))))
    ;; await all
    (let [count-p   (a/invoke Count {:items items} activity-options)
          audited-p (w/invoke Audit {:items items})
          [cnt audited] @(tp/all [count-p audited-p])]
      (detach-workflow! "Archive" {:items items})
      ;; await one: one await over every case, then the first listed that is ready wins, so Ack
      ;; wins a tie with the timer. Not temporal.promise/race (Promise.anyOf: callback order).
      (let [{:keys [^Promise promise ^CancellationScope scope]} (inline-timer (Duration/ofHours 1))]
        (w/await #(or (pos? @acks) (.isCompleted promise)))
        (when (pos? @acks)
          (swap! acks dec)
          (.cancel scope)))
      {:count cnt :audited audited :status @status})))
