(ns continue-as-new.workers
  "Each .twf worker's options map, shared by the worker process and the tests."
  (:require [continue-as-new.counter :refer [Counter Increment]]
            [temporal.client.core :as c]
            [temporal.client.worker :as worker]))

;; worker counterTypes
(def counter-types
  {:task-queue "counters"
   :dispatch   {:workflows  [Counter]
                :activities [Increment]}})

(defn -main [& _]
  (worker/start (c/create-client {:target "127.0.0.1:7233" :namespace "counters"}) counter-types))
