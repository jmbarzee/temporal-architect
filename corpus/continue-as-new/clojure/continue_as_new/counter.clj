(ns continue-as-new.counter
  (:require [temporal.activity :as a :refer [defactivity]]
            [temporal.workflow :as w :refer [defworkflow]])
  (:import [java.time Duration]))

(defactivity Increment [_ {:keys [count]}]
  (inc count))

(defworkflow Counter
  [{:keys [count limit]}]
  (w/sleep (Duration/ofMinutes 1))
  (let [next @(a/invoke Increment {:count count} {:start-to-close-timeout (Duration/ofMinutes 1)})]
    (if (>= next limit)
      next
      ;; Never returns: it ends this run and starts the next.
      (w/continue-as-new {:count next :limit limit}))))
