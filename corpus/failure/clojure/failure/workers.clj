(ns failure.workers
  "Each .twf worker's options map, shared by the worker process and the tests."
  (:require [failure.job :as job]
            [temporal.client.core :as c]
            [temporal.client.worker :as worker]))

;; worker jobTypes
(def job-types
  {:task-queue "jobs"
   :dispatch   {:workflows  [job/Job]
                :activities [job/Reject job/Process]}})

(defn -main [& _]
  (worker/start (c/create-client {:target "127.0.0.1:7233" :namespace "jobs"}) job-types))
