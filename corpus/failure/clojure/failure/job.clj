(ns failure.job
  (:require [clj-commons.slingshot :refer [try+]]
            [temporal.activity :as a :refer [defactivity]]
            [temporal.internal.exceptions :as ex]
            [temporal.promise :as tp]
            [temporal.signals :as s]
            [temporal.workflow :as w :refer [defworkflow]])
  (:import [java.time Duration]))

(defn reject [item]
  (throw (ex-info (str "rejected " item) {:type ::rejected :item item})))

(defn process [_item]
  nil)

;; Activity types are the var names: Reject, Process. Reject's ex-info crosses as a stone.
(defactivity Reject [_ {:keys [item]}]
  (reject item))

;; Every namespace imports java.lang.Process, so the var needs the name unmapped first.
(ns-unmap *ns* 'Process)

(defactivity Process [_ {:keys [item]}]
  (process item))

(def reject-defaults {:start-to-close-timeout (Duration/ofMinutes 1)
                      :retry-options          {:maximum-attempts 1}})

(def process-defaults {:start-to-close-timeout (Duration/ofMinutes 1)})

(defn- reject-and-process
  "await all: tp/all fails at Reject's failure, and Process keeps running."
  [item]
  @(tp/all [(a/invoke Reject {:item item} reject-defaults)
            (a/invoke Process {:item item} process-defaults)])
  nil)

(defworkflow Job
  [{:keys [item]}]
  (let [proceeding (atom false)]
    (s/register-signal-handler!
     (fn [signal-name _]
       (case signal-name
         "Proceed" (reset! proceeding true)
         nil)))
    (w/register-update-handler!
     (fn [update-type _]
       ;; Re-cast an uncaught stone as defworkflow does its body, so it fails only this update.
       (try+
        (case update-type
          :Attempt (reject-and-process item))
        (catch Object _
          (ex/forward &throw-context))))
     {:validator (fn [update-type _]
                   (when-not (#{:Attempt} update-type)
                     (throw (IllegalArgumentException. (str "unknown update " (name update-type))))))})
    (w/await #(deref proceeding))
    (reject-and-process item)))
