(ns continue-as-new.counter-test
  (:require [clojure.test :refer [deftest is use-fixtures]]
            [continue-as-new.counter :refer [Counter]]
            [continue-as-new.workers :as workers]
            [taoensso.timbre :as log]
            [temporal.client.core :as c]
            [temporal.testing.env :as e])
  (:import [io.temporal.api.enums.v1 WorkflowExecutionStatus]
           [io.temporal.client WorkflowClient WorkflowTargetOptions]
           [io.temporal.testing TestWorkflowEnvironment]
           [java.util.concurrent TimeUnit]))

(def ^:dynamic ^TestWorkflowEnvironment *env* nil)

(use-fixtures :each
  (fn [t]
    (log/set-min-level! :error)
    (let [env (e/create)]
      (e/start env workers/counter-types)
      (try (binding [*env* env] (t)) (finally (e/synchronized-stop env))))))

(defn- client ^WorkflowClient [] (e/get-client *env*))

(defn- result
  "The result through a blocking getResult, which lets the test server skip time. A stub with no
  run id follows the chain of runs to the last one's result."
  [id]
  (.getResult (.newUntypedWorkflowStub (client) ^String id) 60 TimeUnit/SECONDS Object))

(defn- start [id params]
  (c/start (c/create-workflow (client) Counter {:task-queue "counters" :workflow-id id}) params))

(deftest counter-completes-at-the-limit
  (start "counter-1" {:count 2 :limit 3})
  (is (= 3 (result "counter-1"))))

(deftest counter-continues-as-new-below-it
  (let [first-run (start "counter-2" {:count 0 :limit 3})]
    (is (= 3 (result "counter-2")))
    (is (= WorkflowExecutionStatus/WORKFLOW_EXECUTION_STATUS_CONTINUED_AS_NEW
           (-> (client)
               (.newUntypedWorkflowStub (-> (WorkflowTargetOptions/newBuilder)
                                            (.setWorkflowExecution first-run)
                                            (.build)))
               (.describe)
               (.getStatus))))))
