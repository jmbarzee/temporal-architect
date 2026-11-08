# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```clojure
(let [ship-result @(w/invoke ShipOrder {:order order})]
  …)
```

- `w/invoke` starts the child by its var's registered name through its own untyped child stub, one per call, and returns a promise of the result; `@` blocks until it (`src/temporal/workflow.clj:311-321`). Options are the optional third argument ([options.md](./options.md#child-workflow-options)).
- A failed child throws from the deref: a slingshot stone is rethrown as that stone (`src/temporal/workflow.clj:318`); anything else is sdk-java's `ChildWorkflowFailure` ([author-java](../../temporal-architect-author-java/reference/workflow-call.md)).
- A qualified callee, `workflow orders.ShipOrder(...)`, is `ShipOrder` required from the namespace for the `.twf` package `orders`.
- **`id:` is the full workflow ID.** A child with an `id_scheme:` gets `:workflow-id (ship-item-id (:id order) (:id item))` from its ID function ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave it unset and sdk-java generates one from `Workflow.randomUUID()` (`internal/sync/ChildWorkflowStubImpl.java:124-130`).
- A child takes `:workflow-id-reuse-policy` only; a start onto a running ID fails ([options.md](./options.md#workflow-id-policies)).
- `w/invoke` hides its stub, so it has no handle: a child that is signaled ([signal-send.md](./signal-send.md#handle-head-a-child)) or whose start alone is awaited goes through sdk-java's untyped child stub, as fire-and-forget does ([detach.md](./detach.md)).
- Bound to a promise, the call is the undereferenced `(w/invoke …)`; `@p` is the `await` ([promise.md](./promise.md)).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Unset, `:parent-close-policy` leaves the server's default, terminate ([author-java](../../temporal-architect-author-java/reference/workflow-call.md)): the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md#child-workflow-options)) when the child should outlive the parent.
