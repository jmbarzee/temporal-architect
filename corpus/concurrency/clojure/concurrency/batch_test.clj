(ns concurrency.batch-test
  (:require [clojure.string :as str]
            [clojure.test :refer [deftest is use-fixtures]]
            [concurrency.batch :as b :refer [Batch]]
            [concurrency.workers :as workers]
            [promesa.core :as p]
            [taoensso.timbre :as log]
            [temporal.client.core :as c]
            [temporal.client.worker :as worker]
            [temporal.promise :as tp]
            [temporal.signals :as s]
            [temporal.testing.env :as e]
            [temporal.workflow :as w :refer [defworkflow]])
  (:import [io.temporal.api.enums.v1 EventType]
           [io.temporal.api.history.v1 HistoryEvent]
           [io.temporal.client WorkflowClient WorkflowStub]
           [io.temporal.testing TestWorkflowEnvironment]
           [io.temporal.worker WorkerFactory WorkerOptions]
           [io.temporal.workflow CancellationScope CompletablePromise Promise Workflow]
           [java.time Duration]
           [java.util.concurrent TimeUnit]))

;; Batch's await one over Ack and timer(1h), the cases listed in :order; returns the winner.
;; :mode "await-one" is the mapped shape; "race" races them through temporal.promise/race
;; (Promise.anyOf); "signal-chan" is the SDK's timed receive, (temporal.signals/<! ch "Ack" 1h).
(defworkflow AwaitOneTie
  [{:keys [order mode]}]
  (if (= mode "signal-chan")
    (let [ch (s/create-signal-chan)]
      (if (s/<! ch "Ack" (Duration/ofHours 1)) "Ack" "timer"))
    (let [acks  (atom 0)
          ^CompletablePromise acked (Workflow/newPromise)
          _     (s/register-signal-handler!
                 (fn [signal-name _]
                   (when (= "Ack" signal-name)
                     (swap! acks inc)
                     (.complete acked nil))))
          {:keys [^Promise promise ^CancellationScope scope]} (b/inline-timer (Duration/ofHours 1))]
      (if (= mode "race")
        @(tp/race (for [cs order]
                    (p/then (p/promise (if (= cs "Ack") acked promise)) (constantly cs))))
        (do
          (w/await #(or (pos? @acks) (.isCompleted promise)))
          (let [won (first (filter #(if (= % "Ack") (pos? @acks) (.isCompleted promise)) order))]
            (when (= won "Ack") (.cancel scope))
            won))))))

;; A promise bound once, timer(24h), raced against Ack every round; returns the Acks counted.
(defworkflow BoundDeadline
  [_]
  (let [acks (atom 0)
        _    (s/register-signal-handler! (fn [signal-name _] (when (= "Ack" signal-name) (swap! acks inc))))
        ;; promise deadline <- timer(24h): bound before the rounds, so losing one never cancels it.
        deadline (w/new-timer (Duration/ofHours 24))]
    (loop [counted 0]
      (w/await #(or (pos? @acks) (p/done? deadline)))
      (if (zero? @acks)
        counted
        (do (swap! acks dec) (recur (inc counted)))))))

(def ^:dynamic ^TestWorkflowEnvironment *env* nil)

(use-fixtures :each
  (fn [t]
    (log/set-min-level! :error)
    (let [env (e/create)]
      (try (binding [*env* env] (t)) (finally (e/synchronized-stop env))))))

(defn- client ^WorkflowClient [] (e/get-client *env*))

(defn- result
  "The workflow's result through the stub's blocking getResult, which lets the test server skip time."
  [{:keys [^WorkflowStub stub]}]
  (.getResult stub 60 TimeUnit/SECONDS Object))

(defn- events [id] (vec (.getEvents (.fetchHistory (client) id))))

(defn- has? [id ^EventType t] (some #(= t (.getEventType ^HistoryEvent %)) (events id)))

(defn- batch [id]
  (e/start *env* workers/batch-types)
  (c/create-workflow (client) Batch {:task-queue "batches" :workflow-id id}))

(deftest batch-acknowledged
  (let [wf (batch "batch-1")]
    (c/start wf {:items ["a" "b"]})
    (.sleep *env* (Duration/ofMinutes 1))
    (c/>! wf :Ack {})
    (is (= {:count 2 :audited true :status "acknowledged"} (result wf)))
    (is (has? "batch-1" EventType/EVENT_TYPE_TIMER_CANCELED) "the losing timer was not cancelled")
    (is (has? "batch-1" EventType/EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED))))

(deftest batch-times-out
  (let [wf (batch "batch-2")]
    (c/start wf {:items ["a"]})
    (is (= {:count 1 :audited true :status "unacknowledged"} (result wf)))
    (is (not (has? "batch-2" EventType/EVENT_TYPE_TIMER_CANCELED)))))

(deftest a-bound-promise-survives-the-rounds-it-loses
  (e/start *env* {:task-queue "bound" :dispatch {:workflows [BoundDeadline]}})
  (let [wf (c/create-workflow (client) BoundDeadline {:task-queue "bound" :workflow-id "bound-1"})]
    (c/start wf nil)
    (c/>! wf :Ack {})
    (.sleep *env* (Duration/ofHours 1))
    (c/>! wf :Ack {})
    (is (= 2 (result wf)))
    (is (not (has? "bound-1" EventType/EVENT_TYPE_TIMER_CANCELED)))
    (is (has? "bound-1" EventType/EVENT_TYPE_TIMER_FIRED) "the deadline never fired")))

(defn- until
  "Waits up to 10s of real time for an event of the type; throws rather than hang."
  [id t]
  (let [deadline (+ (System/currentTimeMillis) 10000)]
    (while (not (has? id t))
      (when (> (System/currentTimeMillis) deadline)
        (throw (IllegalStateException. (str id ": " t " never reached history"))))
      (Thread/sleep 20))))

(defn- tie-worker
  "A worker factory of its own, so it can be stopped. A zero sticky timeout sends no sticky
  attributes, so the next task goes to the normal queue, not a stopped worker's sticky queue;
  temporal.client.worker has no key for it, so the worker is built through interop."
  ^WorkerFactory []
  (let [f (WorkerFactory/newInstance (client))
        wkr (.newWorker f "await-one"
                        (-> (WorkerOptions/newBuilder)
                            (.setStickyQueueScheduleToStartTimeout Duration/ZERO)
                            (.build)))]
    (worker/init wkr {:dispatch {:workflows [AwaitOneTie]}})
    (.start f)
    f))

(defn- miss
  "nil when the timer and Ack reached one workflow task, otherwise the history between them."
  [id]
  (let [between (->> (events id)
                     (map #(.getEventType ^HistoryEvent %))
                     (drop-while #(not= EventType/EVENT_TYPE_TIMER_FIRED %))
                     (take-while #(not= EventType/EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED %)))]
    (when (some #{EventType/EVENT_TYPE_WORKFLOW_TASK_STARTED} between)
      (str id ": " (str/join "," between)))))

(defn- tie-once
  "Runs AwaitOneTie on a test env of its own, with the timer fired and Ack sent while no worker
  runs, so both reach one workflow task; returns {:won winner}, or {:miss history} when the setup
  missed the tie."
  [id order mode]
  (let [env (e/create)]
    (try
      (binding [*env* env]
        (let [wf (c/create-workflow (client) AwaitOneTie {:task-queue "await-one" :workflow-id id})]
          (c/start wf {:order order :mode mode})
          (let [first-worker (tie-worker)]
            (until id EventType/EVENT_TYPE_TIMER_STARTED)
            (.shutdownNow first-worker)
            (.awaitTermination first-worker 10 TimeUnit/SECONDS))
          ;; Skip time past the timer. With no worker to take the timer's workflow task, the sleep
          ;; may not return, so it runs on its own thread.
          (doto (Thread. ^Runnable (fn [] (try (.sleep env (Duration/ofHours 1)) (catch RuntimeException _))))
            (.setDaemon true)
            (.start))
          (until id EventType/EVENT_TYPE_TIMER_FIRED)
          (c/>! wf :Ack {})
          (if-let [m (miss id)]
            {:miss m}
            (let [second-worker (tie-worker)]
              (try {:won (result wf)} (finally (.shutdownNow second-worker)))))))
      (finally (e/synchronized-stop env)))))

(defn- on-a-tie
  "Asserts AwaitOneTie's winner on a real tie. The stopped worker's last poll may take the timer's
  task, so a missed setup is retried on a fresh env and workflow ID (a same-server retry can hang),
  then skipped, never failed (#529); clojure.test has no skip, so the skip is printed."
  [expected order mode]
  (let [attempts 3]
    (loop [attempt 1 missed []]
      (if (> attempt attempts)
        (println "skipped: the tie was not set up in" attempts "attempts:" (str/join "; " missed))
        (let [{:keys [won miss]} (tie-once (str "tie-" order "-" mode "-" attempt) order mode)]
          (if miss
            (recur (inc attempt) (conj missed miss))
            (is (= expected won))))))))

(deftest await-one-the-first-listed-of-several-ready-cases-wins
  (on-a-tie "Ack" ["Ack" "timer"] "await-one")
  (on-a-tie "timer" ["timer" "Ack"] "await-one"))

(deftest the-sdk-race-is-not-listed-order
  ;; Ack is listed first, but the timer's promise completes as its event is applied, before Ack's
  ;; handler runs on a callback thread.
  (on-a-tie "timer" ["Ack" "timer"] "race"))

(deftest the-sdk-timed-signal-receive-loses-a-tie-to-its-timer
  ;; (s/<! ch "Ack" d) is Workflow.await(d, cond), which reports the timer on a tie: await one
  ;; {timer, signal}, never {signal, timer}.
  (on-a-tie "timer" ["timer" "Ack"] "signal-chan"))
