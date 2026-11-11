(ns failure.job-test
  (:require [clj-commons.slingshot :refer [try+]]
            [clojure.test :refer [deftest is use-fixtures]]
            [failure.job :as job :refer [Job]]
            [failure.workers :as workers]
            [taoensso.timbre :as log]
            [temporal.client.core :as c]
            [temporal.internal.exceptions :as ex]
            [temporal.testing.env :as e])
  (:import [io.temporal.api.enums.v1 EventType WorkflowExecutionStatus]
           [io.temporal.api.history.v1 HistoryEvent]
           [io.temporal.client WorkflowFailedException WorkflowStub WorkflowUpdateException]
           [io.temporal.testing TestWorkflowEnvironment]
           [java.util.concurrent ExecutionException TimeUnit]))

(def ^:dynamic ^TestWorkflowEnvironment *env* nil)

;; Process, the slow branch, runs until the test ends: waiting for it fails the bounded wait, and
;; teardown releases it.
(use-fixtures :each
  (fn [t]
    (log/set-min-level! :fatal)
    (let [env (e/create)
          released (promise)]
      (try
        (with-redefs [job/process (fn [_] (deref released 60000 nil))]
          (e/start env workers/job-types)
          (binding [*env* env] (t)))
        (finally
          (deliver released true)
          (e/synchronized-stop env))))))

(defn- start [id]
  (let [wf (c/create-workflow (e/get-client *env*) Job {:task-queue "jobs" :workflow-id id})]
    (c/start wf {:item "a"})
    wf))

(defn- run-failure
  "What the run fails with, through the stub's blocking getResult; a run still open after 30 s
  throws a TimeoutException instead."
  [{:keys [^WorkflowStub stub]}]
  (try (.getResult stub 30 TimeUnit/SECONDS Object) nil
       (catch WorkflowFailedException e e)))

(defn- update-failure
  "What the Attempt update fails with; nil if it completes, or is still open after 30 s."
  [wf]
  (let [attempt (future (c/update wf :Attempt {}))]
    (try (deref attempt 30000 nil) nil
         (catch ExecutionException e (.getCause e))
         (finally (future-cancel attempt)))))

(defn- rejected?
  "Whether the failure carries Reject's stone."
  [failure]
  (and (ex/slingshot? failure)
       (= ::job/rejected (try+ (ex/recast-stone failure) (catch map? stone (:type stone))))))

(defn- assert-process-still-running
  "Process was scheduled, and neither completed nor was asked to cancel."
  [id]
  (let [evs       (.getEvents (.fetchHistory (e/get-client *env*) id))
        types     (set (map #(.getEventType ^HistoryEvent %) evs))
        scheduled (set (for [^HistoryEvent ev evs
                             :when (= EventType/EVENT_TYPE_ACTIVITY_TASK_SCHEDULED (.getEventType ev))]
                         (.getName (.getActivityType (.getActivityTaskScheduledEventAttributes ev)))))]
    (is (scheduled "Process") "Process was not scheduled")
    (is (not (types EventType/EVENT_TYPE_ACTIVITY_TASK_COMPLETED)) "Process completed")
    (is (not (types EventType/EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED)) "Process was asked to cancel")))

(deftest a-branch-failure-fails-the-run-while-the-other-branch-runs
  (let [wf (start "job-1")]
    (c/>! wf :Proceed {})
    (is (rejected? (run-failure wf)))
    (assert-process-still-running "job-1")))

(deftest a-branch-failure-in-an-update-fails-only-that-update
  (let [wf (start "job-2")
        failure (update-failure wf)]
    (is (instance? WorkflowUpdateException failure))
    (is (rejected? failure))
    (is (= WorkflowExecutionStatus/WORKFLOW_EXECUTION_STATUS_RUNNING
           (.getStatus (.describe ^WorkflowStub (:stub wf)))))
    (assert-process-still-running "job-2")))
