# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```haskell
(inventory, payment) <- failFast \guarded ->
  concurrently
    (guarded (executeActivity reserveInventory reserveOptions order))
    (guarded (chargePayment order.payment))
```

- `concurrently a b` (`Workflow.hs:1783-1784`) runs both branches, whatever their kind, and returns both results in branch order. Three or more: `runConcurrentWorkflowActions ((,,) <$> ConcurrentWorkflow a <*> ConcurrentWorkflow b <*> ConcurrentWorkflow c)` (`Workflow.hs:1924-1940`); branches of one type: `sequenceConcurrently [a, b, c]`. Here `chargePayment` is a local helper over `executeNexusOperation` with `RequireCallStack =>` in its signature ([nexus.md](./nexus.md)).
- Each branch is wrapped in `failFast`'s guard, so the first to fail fails the `await all` at once ([§ A branch fails](#a-branch-fails)). A branch that cannot fail, such as a timer or a signal's `A.take`, needs no guard.
- Never `forkIO` or the `async` package: `IO` is a type error in a workflow ([idioms.md § determinism](./idioms.md#determinism)).
- A `detach workflow` branch is `startChildWorkflow …` then `waitChildWorkflowStart`, done once the child starts; `detach nexus` is unsupported ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```haskell
failFast \guarded -> traverseConcurrently_ (guarded . executeActivity processBatchItem batchOptions) items
```

`traverseConcurrently` (`Workflow.hs:1818-1823`) keeps the results in `items`' order; the `_` form drops them.

## A branch fails

The first branch to fail fails the `await all` at once, with that failure, and the branches still running are not cancelled (`twf spec statement-syntax`, Await All Block). Copy `failFast` from the corpus's [`haskell/FailFast.hs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/haskell/FailFast.hs) into the project:

```haskell
failFast :: RequireCallStack => ((forall x. Workflow x -> Workflow x) -> Workflow a) -> Workflow a
failFast body = do
  failure <- newStateVar Nothing
  let guarded m = m `catch` \e -> modifyStateVar failure (<|> Just e) >> throwM (e :: SomeException)
  race (waitCondition (isJust <$> readStateVar failure)) (body guarded) >>= \case
    Left () -> throwM . fromJust =<< readStateVar failure
    Right a -> pure a
```

- **Not bare `concurrently`.** Under it, and under `traverseConcurrently`, a branch's failure can wait for its siblings: once both sides block, the right side's failure surfaces at once and the left side's only after the right side finishes, so failures surface in reverse listed order (`Workflow/Internal/Monad.hs:138-181`). `independently` waits for both (`Workflow.hs:1847-1853`).
- **The race.** A guard records its branch's failure in a `StateVar`, which wakes the `waitCondition` (`Workflow/Internal/Monad.hs:652-674,701-709`), and rethrows. `race` evaluates its left side first (`Workflow.hs:1691-1694`), so it returns the recorded failure while the other branches run. `catch` and `throwM` are the `exceptions` package's (`Workflow/Internal/Monad.hs:301-304`).
- **Nothing is cancelled.** `race` stops evaluating the losing side and sends no command (`Workflow.hs:1745-1752`): a call is cancelled only by its own `cancel`, as an activity's request-cancel command shows (`Workflow.hs:487-494`). The open branches end with the run, a child per its `parent_close_policy`.
- **Two failures.** The first to fail surfaces: its guard runs first, and `<|>` keeps it over a later one. Two failures resolved in one workflow activation have no first; which surfaces then follows the SDK's evaluation order.
- **Uncaught**, the failure fails the run in the main body ([close.md](./close.md)) and only the update in an [update handler](./update-handler.md). In a [signal handler](./signal-handler.md) it fails the run only through `failFast`.

[`corpus/failure/haskell/`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/haskell/) is the worked example; its test asserts the update fails while the run goes on, then the run fails with `Reject`'s failure while `Process` runs, with no cancel request in the history.
