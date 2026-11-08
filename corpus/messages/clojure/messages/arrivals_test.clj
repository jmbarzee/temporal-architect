(ns messages.arrivals-test
  (:require [clojure.test :refer [deftest is use-fixtures]]
            [messages.arrivals :as arr]
            [taoensso.timbre :as log]
            [temporal.client.core :as c]
            [temporal.signals :as s]
            [temporal.testing.env :as e]
            [temporal.workflow :as w :refer [defworkflow]])
  (:import [io.temporal.client WorkflowNotFoundException WorkflowStub]
           [io.temporal.testing TestWorkflowEnvironment]
           [io.temporal.workflow Async CancellationScope CompletablePromise Functions$Func Promise Workflow]
           [java.time Duration]
           [java.util.concurrent TimeUnit]))

(defn- result
  "The workflow's result through the stub's blocking getResult, which lets the test server skip time."
  [{:keys [^WorkflowStub stub]}]
  (.getResult stub 60 TimeUnit/SECONDS Object))

;; Test workflows for arrivals; registered only here.

(defn- fork
  "Runs f on a workflow thread of its own (Async/function); returns its Promise."
  ^Promise [f]
  (Async/function (reify Functions$Func (apply [_] (f)))))

(defn- of-x
  "Arrivals of signal X, with the handler that adds them."
  []
  (let [xs (arr/arrivals)]
    (s/register-signal-handler! (fn [signal-name v] (when (= "X" signal-name) (arr/add! xs v))))
    xs))

(defn- inline-timer
  "An inline timer case: started in a scope of its own, to be cancelled when it loses."
  [^Duration d]
  (let [^CompletablePromise p (Workflow/newPromise)
        scope (Workflow/newCancellationScope ^Runnable (fn [] (.completeFrom p (Workflow/newTimer d))))]
    (.run scope)
    {:promise p :scope scope}))

;; Two waiters of X; the one started first sleeps before it waits, so the other begins waiting first.
(defworkflow TwoWaiters
  [_]
  (let [xs   (of-x)
        took (atom (sorted-map))
        a    (fork #(do (w/sleep (Duration/ofSeconds 1)) (swap! took assoc "created first" (arr/take! xs))))
        b    (fork #(swap! took assoc "began first" (arr/take! xs)))]
    (.get (Promise/allOf (into-array Promise [a b])))
    @took))

;; Binds a promise on X, then awaits X.
(defworkflow PromiseThenAwait
  [_]
  (let [xs      (of-x)
        p       (arr/promise! xs)
        awaited (arr/take! xs)]
    {"promise" @p "await" awaited}))

;; Starts a waiter of X and cancels it, then takes X.
(defworkflow CancelledWaiter
  [_]
  (let [xs     (of-x)
        waiter (Workflow/newCancellationScope ^Runnable (fn [] (arr/promise! xs)))]
    (.run waiter)
    (w/sleep (Duration/ofSeconds 1))
    (.cancel waiter)
    (arr/take! xs)))

;; await one: a case for X raced against a timer (listed second), then takes X.
(defworkflow AwaitOne
  [{:keys [timeout-seconds]}]
  (let [xs (of-x)
        t  (arr/begin! xs)
        {:keys [^Promise promise ^CancellationScope scope]} (inline-timer (Duration/ofSeconds timeout-seconds))]
    (w/await #(or (arr/ready? xs t) (.isCompleted promise)))
    (let [first-case (if (arr/ready? xs t) ; first listed wins
                       (let [v (arr/claim! xs)] (.cancel scope) (str "case " v))
                       (do (arr/leave! xs t) "timer"))]
      [first-case (str "then " (arr/take! xs))])))

;; The SDK's own mapping: each waiter parks in temporal.signals/<! on one signal channel.
(defworkflow NaiveTwoWaiters
  [_]
  (let [ch   (s/create-signal-chan)
        took (atom (sorted-map))
        a    (fork #(do (w/sleep (Duration/ofSeconds 1)) (swap! took assoc "created first" (s/<! ch "X"))))
        b    (fork #(swap! took assoc "began first" (s/<! ch "X")))]
    (.get (Promise/allOf (into-array Promise [a b])))
    @took))

(def ^:dynamic ^TestWorkflowEnvironment *env* nil)
(def ^:private n (atom 0))

(use-fixtures :each
  (fn [t]
    (log/set-min-level! :error)
    (let [env (e/create)]
      (e/start env {:task-queue "arrivals"
                    :dispatch   {:workflows [TwoWaiters PromiseThenAwait CancelledWaiter AwaitOne NaiveTwoWaiters]}})
      (try (binding [*env* env] (t)) (finally (e/synchronized-stop env))))))

(defn- with-two-xs
  "Runs the workflow, sending X \"1\" after a minute and X \"2\" after two."
  [wf-def args]
  (let [wf (c/create-workflow (e/get-client *env*) wf-def {:task-queue "arrivals" :workflow-id (str "wf-" (swap! n inc))})]
    (c/start wf args)
    (.sleep *env* (Duration/ofMinutes 1))
    (c/>! wf :X "1")
    (.sleep *env* (Duration/ofMinutes 1))
    (try (c/>! wf :X "2")
         (catch WorkflowNotFoundException _)) ; a workflow that needed one X has completed
    (result wf)))

(deftest arrivals-go-to-waiters-in-the-order-they-began
  (is (= {"began first" "1" "created first" "2"} (with-two-xs TwoWaiters nil))))

(deftest a-promise-begins-waiting-at-its-binding
  (is (= {"promise" "1" "await" "2"} (with-two-xs PromiseThenAwait nil))))

(deftest await-one-the-case-wins-and-takes
  (is (= ["case 1" "then 2"] (with-two-xs AwaitOne {:timeout-seconds 3600}))))

(deftest await-one-the-timer-wins-and-the-case-takes-nothing
  (is (= ["timer" "then 1"] (with-two-xs AwaitOne {:timeout-seconds 1}))))

(deftest a-cancelled-waiter-leaves-the-queue
  (is (= "1" (with-two-xs CancelledWaiter nil))))

(deftest the-sdk-signal-channel-serves-thread-order-not-wait-order
  ;; Workflow threads run one at a time, so no arrival is lost, but the waiter created first takes
  ;; the first arrival although the other began waiting first.
  (is (= {"began first" "2" "created first" "1"} (with-two-xs NaiveTwoWaiters nil))))
