(ns concurrency.workers
  "Each .twf worker's registrations, shared by the worker process and the tests."
  (:require [concurrency.batch :refer [Archive Audit Batch Count Store]]
            [temporal.client.core :as c]
            [temporal.client.worker :as worker]))

;; worker batchTypes: an explicit :dispatch, never auto-dispatch (which registers every
;; defworkflow/defactivity loaded in the JVM).
(def batch-types
  {:task-queue "batches"
   :dispatch   {:workflows  [Batch Audit Archive]
                :activities [Count Store]}})

(defn -main [& _]
  (worker/start (c/create-client {:target "127.0.0.1:7233" :namespace "batches"}) batch-types))
