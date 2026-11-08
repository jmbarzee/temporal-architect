# signal send

A signal travels as one payload: the `.twf` args are one map keyed by param name, and no args send `{}`, never `nil` (`src/temporal/internal/utils.clj:141-150`). The signal name is a string or a bare keyword, never a namespaced `::kw` ([SKILL.md](../SKILL.md#wire-names)).

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```clojure
(let [^ChildWorkflowStub pay (Workflow/newUntypedChildWorkflowStub "ProcessPayment")
      ^Promise pay-result    (.executeAsync pay Object (into-array Object [{:order order}]))]
  (.signal pay "OrderShipped" (into-array Object [{:shipment-id shipment-id}]))
  ;; Signaling does not consume the child.
  (let [payment (.get pay-result)]
    …))
```

- `w/invoke` hides its stub ([workflow-call.md](./workflow-call.md)), so a child that is signaled starts through sdk-java's untyped child stub, with `ChildWorkflowOptions` as the optional second argument (`workflow/Workflow.java:521`). The stub is the handle: `.signal` signals the child it started, and first waits for that start, so a send never races it (`internal/sync/ChildWorkflowStubImpl.java:102-121`).
- Its promise is sdk-java's `Promise`, read with `.get`: a failed child throws `ChildWorkflowFailure` from it, and a slingshot stone is not recast ([author-java](../../temporal-architect-author-java/reference/workflow-call.md)).
- The call returns on **server acceptance — never on the child's handler running**. Never treat it as "the child processed my signal". A failed send throws `SignalExternalWorkflowException`, failing the sender; catch it when it should not.
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one running child the stub refers to.

## Type head (by ID)

```twf
signal ShipItem.Shipped(event.tracking)
	id: "ship-{event.orderId}-{event.sku}"
signal ShipItem.Shipped(stuck.tracking)
	id: stuck.workflowId
	run_id: stuck.runId
signal FulfillOrder.ItemShipped(item.id)
	id: parent
```

```clojure
(s/>! (ship-item-id (:order-id event) (:sku event)) "Shipped" {:tracking (:tracking event)})

(w/signal-external (w/external-workflow (:workflow-id stuck) (:run-id stuck))
                   "Shipped" {:tracking (:tracking stuck)})

(let [parent-id (.getParentWorkflowId (Workflow/getInfo))]
  (when (.isPresent parent-id)
    (s/>! (.get parent-id) "ItemShipped" {:id (:id item)})))
```

- `s/>!` signals the latest run of a workflow ID (`src/temporal/signals.clj:49-54`); `w/external-workflow` with a run ID targets that run, and `w/signal-external` sends through it (`src/temporal/workflow.clj:566-576,623-627`). Both are sdk-java's external stub, so the send rules above hold.
- `id:` is the full workflow ID: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the value as is.
- `id: parent` reads `Workflow/getInfo`'s `getParentWorkflowId`, empty when no workflow started this run (`workflow/WorkflowInfo.java:116`); `w/get-info` omits it (`src/temporal/internal/workflow.clj:18-25`). The guard skips the send — fail instead if the design has no parentless start.
- The send throws when no such execution is running; handle it as above.
