# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```haskell
(inventory, payment) <-
  concurrently
    (executeActivity reserveInventory reserveOptions order)
    (chargePayment order.payment)
```

- `concurrently a b` (`Workflow.hs:1783-1784`) runs both branches, whatever their kind, and returns both results in branch order. Three or more: `runConcurrentWorkflowActions ((,,) <$> ConcurrentWorkflow a <*> ConcurrentWorkflow b <*> ConcurrentWorkflow c)` (`Workflow.hs:1924-1940`); branches of one type: `sequenceConcurrently [a, b, c]`. Here `chargePayment` is a local helper over `executeNexusOperation` with `RequireCallStack =>` in its signature ([nexus.md](./nexus.md)).
- Never `forkIO` or the `async` package: `IO` is a type error in a workflow ([idioms.md § determinism](./idioms.md#determinism)).
- A branch that throws fails the wait. How the other branch then runs is the `concurrently` haddock's (`Workflow.hs:1780-1782`); `independently` runs both to the end before it rethrows (`Workflow.hs:1846-1853`).
- A `detach workflow` branch is `startChildWorkflow …` then `waitChildWorkflowStart`, done once the child starts; `detach nexus` is unsupported ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```haskell
traverseConcurrently_ (executeActivity processBatchItem batchOptions) items
```

`traverseConcurrently` (`Workflow.hs:1818-1823`) keeps the results in `items`' order; the `_` form drops them.
