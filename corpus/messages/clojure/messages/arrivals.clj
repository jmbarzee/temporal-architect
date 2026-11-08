(ns messages.arrivals
  "A signal's or update's pending arrivals and the waiters for them, each oldest first: a handler
  adds an arrival when it returns, and the waiter that began waiting first takes the oldest."
  (:require [promesa.core :as p]
            [temporal.workflow :as w])
  (:import [io.temporal.workflow Async Functions$Func]))

(defn arrivals
  "New, empty arrivals: one per signal or update, created inside the workflow."
  []
  (atom {:pending [] :waiters [] :next 0}))

(defn add!
  "Called by the handler as it returns: the arrival is pending."
  [a v]
  (swap! a update :pending conj v))

(defn begin!
  "Begins a waiter and returns its ticket. An await one case begins, checks ready? without taking,
  and claims only if it wins; win or lose, it leaves."
  [a]
  (let [t (:next @a)]
    (swap! a #(-> % (update :waiters conj t) (update :next inc)))
    t))

(defn ready?
  "Whether an arrival is pending and ticket t is the earliest waiter. A boolean, never nil:
  w/await's predicate is a java.util.function.Supplier unboxed to boolean, so nil throws."
  [a t]
  (let [{:keys [pending waiters]} @a]
    (boolean (and (seq pending) (= t (first waiters))))))

(defn claim!
  "Gives the oldest arrival to the earliest waiter, which must be ready."
  [a]
  (let [v (first (:pending @a))]
    (swap! a #(-> % (update :pending subvec 1) (update :waiters subvec 1)))
    v))

(defn leave!
  "Ends a waiter that did not claim; after a claim it does nothing."
  [a t]
  (swap! a update :waiters (fn [ws] (filterv #(not= t %) ws))))

(defn- take-at [a t]
  (try
    (w/await #(ready? a t))
    (claim! a)
    (finally
      (leave! a t))))

(defn take!
  "Waits for the oldest arrival: `await signal X`."
  [a]
  (take-at a (begin! a)))

(defn promise!
  "`promise p <- signal X`: the ticket is taken now, so the promise begins waiting at its binding.
  The wait runs on a workflow thread of its own (Async/function); the SDK wraps no Async."
  [a]
  (let [t (begin! a)]
    (p/promise (Async/function (reify Functions$Func (apply [_] (take-at a t)))))))
