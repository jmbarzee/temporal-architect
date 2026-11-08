(ns messages.workers
  "Each .twf worker's registrations, shared by the worker process and the tests."
  (:require [messages.approval :refer [Approval]]
            [temporal.client.core :as c]
            [temporal.client.worker :as worker]))

;; worker approvalTypes: an explicit :dispatch, never auto-dispatch (which registers every
;; defworkflow/defactivity loaded in the JVM).
(def approval-types
  {:task-queue "approvals"
   :dispatch   {:workflows [Approval]}})

(defn -main [& _]
  (worker/start (c/create-client {:target "127.0.0.1:7233" :namespace "approvals"}) approval-types))
