(ns messages.approval
  (:require [messages.arrivals :as arr]
            [temporal.signals :as s]
            [temporal.workflow :as w :refer [defworkflow]]))

;; The var's name is the registered Workflow Type ("Approval"), so it is written as the .twf
;; names it. A workflow takes one argument: a map of the .twf params.
(defworkflow Approval
  [{:keys [request]}]
  (let [status   (atom "submitted")
        opens    (arr/arrivals)
        approves (arr/arrivals)
        reviews  (arr/arrivals)]
    ;; One dynamic handler per kind (a second registration replaces the first): it dispatches on
    ;; the wire name, runs the .twf handler body, then adds the arrival.
    (s/register-signal-handler!
     (fn [signal-name args]
       (case signal-name
         "Open"    (do (reset! status "open") (arr/add! opens true))
         "Approve" (do (reset! status "approved") (arr/add! approves args))
         nil)))
    (w/register-update-handler!
     (fn [update-type args]
       (case update-type
         :Review (do (reset! status "reviewed") (arr/add! reviews args) @status)))
     {:validator (fn [update-type _]
                   (when-not (#{:Review} update-type)
                     (throw (IllegalArgumentException. (str "unknown update " (name update-type))))))})
    (w/register-query-handler!
     (fn [query-type _]
       (case query-type
         :Status @status)))
    (arr/take! opens)
    (let [approval           (arr/promise! approves) ; begins waiting here, at its binding
          {:keys [note]}     (arr/take! reviews)
          {:keys [approver]} @approval]
      {:request request :approver approver :note note :status @status})))
