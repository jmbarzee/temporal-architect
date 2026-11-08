(ns messages.approval-test
  (:require [clojure.test :refer [deftest is use-fixtures]]
            [messages.approval :refer [Approval]]
            [messages.workers :as workers]
            [taoensso.timbre :as log]
            [temporal.client.core :as c]
            [temporal.testing.env :as e])
  (:import [io.temporal.testing TestWorkflowEnvironment]
           [io.temporal.api.enums.v1 EventType]
           [io.temporal.api.history.v1 HistoryEvent]
           [io.temporal.client WorkflowStub]
           [java.time Duration]
           [java.util.concurrent TimeUnit]))

(def ^:dynamic ^TestWorkflowEnvironment *env* nil)

(defn- result
  "The workflow's result. c/get-result chains the stub's future through promesa, so a deref never
  reaches the test server's time-skipping unlock; the stub's blocking getResult does."
  [{:keys [^WorkflowStub stub]}]
  (.getResult stub 60 TimeUnit/SECONDS Object))

(use-fixtures :each
  (fn [t]
    (log/set-min-level! :error)
    (let [env (e/create)]
      (e/start env workers/approval-types)
      (try (binding [*env* env] (t)) (finally (e/synchronized-stop env))))))

(defn- start [id]
  (let [wf (c/create-workflow (e/get-client *env*) Approval {:task-queue "approvals" :workflow-id id})]
    (c/start wf {:request "access"})
    wf))

(defn- sleep [^Duration d] (.sleep *env* d))

(defn- events [id]
  (.getEvents (.fetchHistory (e/get-client *env*) id)))

(deftest approval
  (let [wf (start "approval-1")]
    ;; Approve arrives before anything waits for it, and stays pending.
    (sleep (Duration/ofSeconds 30))
    (c/>! wf :Approve {:approver "Grace"})
    (sleep (Duration/ofSeconds 30))
    (c/>! wf :Open {})
    (sleep (Duration/ofMinutes 1))
    (is (= "open" (c/query wf :Status nil)))
    (is (= "reviewed" (c/update wf :Review {:note "LGTM"})))
    (is (= {:request "access" :approver "Grace" :note "LGTM" :status "reviewed"} (result wf)))
    ;; The .twf names reach the wire byte for byte.
    (let [evs (events "approval-1")
          ^HistoryEvent started (first evs)]
      (is (= "Approval" (.getName (.getWorkflowType (.getWorkflowExecutionStartedEventAttributes started)))))
      (is (= #{"Approve" "Open"}
             (set (for [^HistoryEvent ev evs
                        :when (= EventType/EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED (.getEventType ev))]
                    (.getSignalName (.getWorkflowExecutionSignaledEventAttributes ev))))))
      (is (= ["Review"]
             (for [^HistoryEvent ev evs
                   :when (= EventType/EVENT_TYPE_WORKFLOW_EXECUTION_UPDATE_ACCEPTED (.getEventType ev))]
               (.getName (.getInput (.getAcceptedRequest (.getWorkflowExecutionUpdateAcceptedEventAttributes ev))))))))))

(deftest review-caller-gets-its-result-before-any-waiter-takes-it
  (let [wf (start "approval-2")]
    ;; Review arrives while Approval still awaits Open, before anything waits for Review.
    (sleep (Duration/ofSeconds 30))
    (is (= "reviewed" (c/update wf :Review {:note "LGTM"})))
    (c/>! wf :Open {})
    (sleep (Duration/ofMinutes 1))
    (c/>! wf :Approve {:approver "Grace"})
    (is (= {:request "access" :approver "Grace" :note "LGTM" :status "approved"} (result wf)))))

(deftest an-unknown-update-is-rejected-by-the-validator
  (let [wf (start "approval-3")]
    (is (thrown? Exception (c/update wf :Nope {})))
    (c/>! wf :Open {})
    (c/>! wf :Approve {:approver "Grace"})
    (is (= "reviewed" (c/update wf :Review {:note "LGTM"})))
    (is (= "reviewed" (:status (result wf))))))
