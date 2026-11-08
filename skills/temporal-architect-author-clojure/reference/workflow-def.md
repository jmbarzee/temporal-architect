# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```clojure
(ns orders.process-order
  (:require [temporal.workflow :refer [defworkflow]]))

(defworkflow ProcessOrder
  [{:keys [order]}]
  {:status "done"})
```

A `defworkflow` var named as the `.twf` names it, which is its registered name ([SKILL.md](../SKILL.md#wire-names)). It takes exactly one argument, the map of the `.twf` params (`src/temporal/workflow.clj:204-244`, `src/temporal/internal/workflow.clj:109-113`); the body's value is the result, and no DSL return type → `nil`. Workflow state is a local `atom` the handlers close over ([types.md](./types.md) for the values). The two-argument `[ctx args]` form is deprecated (`src/temporal/workflow.clj:225-227`).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```clojure
(defn ship-item-id [order-id item-id]
  (str "ship-" order-id "-" item-id))
```

One ID function per scheme, beside the workflow, taking one argument per hole, and returning the full workflow ID. Every start passes it as `:workflow-id` ([workflow-call.md](./workflow-call.md)), every constructed send targets it ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start uses it; never format the ID inline. A string, not a keyword: `:workflow-id` goes through `namify`, which keeps a keyword's namespace (`src/temporal/internal/child_workflow.clj:22`, `src/temporal/internal/utils.clj:152-156`).

A type that has a scheme or ID policies also gets one start-options function holding its ID, task queue and `default_options:`; every client start uses it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```clojure
(defn order-tracker-options [order-id]
  {:workflow-id                 (order-tracker-id order-id)
   :task-queue                  "fulfillment"
   :workflow-id-conflict-policy :use-existing})

(c/start (c/create-workflow client OrderTracker (order-tracker-options order-id)) {:order-id order-id})
```

`c/create-workflow` builds the client's `WorkflowOptions` from the map (`src/temporal/client/core.clj:105-110`, `src/temporal/internal/workflow.clj:63-82`); the run's params travel in `c/start` (`src/temporal/client/core.clj:112-117`).

## Determinism constraints

[`doc/workflows.md` § Workflow Implementation Constraints](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#workflow-implementation-constraints) and [§ Promises](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#promises): every promise chain starts from an SDK promise, never `promesa`'s. The runner is sdk-java's ([author-java](../../temporal-architect-author-java/reference/workflow-def.md#determinism-constraints)); changing running workflows: [§ Versioning](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#versioning).
