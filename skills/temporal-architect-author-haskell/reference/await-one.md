# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```haskell
w <- A.begin paymentsReceived
timer <- createTimer (hours 24)
r <- race (waitCondition (A.ready paymentsReceived w)) (traverse_ wait timer)
case r of
  Left () -> do
    _ <- A.claim paymentsReceived w
    traverse_ cancel timer
    writeStateVar status "processing"
  Right () -> do
    A.leave paymentsReceived w
    executeActivity cancelOrder cancelOptions orderId
    throwM ApplicationFailure {type' = "OrderCancelled", message = "order cancelled", nonRetryable = True, details = [encodeJSON OrderResult {status = "cancelled"}], stack = "", nextRetryDelay = Nothing}
```

`race` in listed order is `await one`: `race a b` runs `a` first, then `b`, and on every resume tries `a` before `b` again, so a case ready on entry wins and, of two ready together, the left (`Workflow.hs:1691-1759`). More cases nest to the right, `race a (race b c)`, giving `Either a (Either b c)` to match on. The race stops evaluating the losing branch and cancels nothing (`Workflow.hs:1744-1752`). The corpus's [`ArrivalsFixtures.hs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/haskell/ArrivalsFixtures.hs) `awaitOneX` is the worked example, and its tests hold the tie.

## Cases

| Case | Before `race` | Branch | Winner / losers |
|------|---------------|--------|-----------------|
| signal, update | `w <- A.begin xs` | `waitCondition (A.ready xs w)` | winner `A.claim xs w`; every losing message case `A.leave xs w` |
| timer | `t <- createTimer d` | `traverse_ wait t` | every other winner `traverse_ cancel t` |
| activity, child workflow, nexus | — | the inline call: `executeActivity …`, `executeChildWorkflow …`, `executeNexusOperation …` | its result |
| promise | its binding ([promise.md](./promise.md)) | `wait p`; a timer promise `traverse_ wait p` | its result |
| signal or update promise | `p <- A.begin xs`, earlier | `waitCondition (A.ready xs p)` | winner `A.claim xs p`; a losing promise keeps its place |
| condition | — | `waitCondition (readStateVar c)` ([condition.md](./condition.md)) | — |
| nested `await all:` | — | `concurrently a b` ([await-all.md](./await-all.md)) | its results |

A message case waits without taking: `ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winning branch claims. A losing case must `leave`, or it holds its place and blocks later waiters. An earlier waiter is served first, so a case waits behind it. A branch that throws ends the race with that exception.

## Lifecycle of losing cases

Spec 06's rules, mapped:

- **A losing inline timer is cancelled**: `traverse_ cancel t` in every other case's branch, or it fires later and adds a workflow task (`Workflow.hs:1506-1531`).
- **Inline activity, child workflow and Nexus cases keep running** until the run ends: `race` cancels nothing, so add no `cancel`. For a child's lifecycle at parent close, use `parentClosePolicy` ([options.md](./options.md#child-workflow-options)).
- **A bound promise is never cancelled by losing**: it stays awaitable after the block, and a message promise keeps its place in line.

## Tie order at `e57a0ae`

Spec 06 has the first listed ready case win. At the pin the SDK deviates in one case (#474's class): when a signal or update whose handler runs to `A.add` (or its condition write) without blocking reaches the workflow in the same activation as a timer, activity, child or Nexus result, the message case, or the condition, wins whatever the listing. A handler that first blocks, as an update calling an activity does, adds its arrival in a later activation.

`applyJobs` puts the activation's signal and update handlers on the run queue and holds its resolutions back (`WorkflowInstance.hs:700-730`, `Workflow/Eval.hs:279-287`). The run queue runs until it is empty, so a handler's `StateVar` write wakes its waiters and the race resumes, before `checkActivationResults` fills the resolutions' IVars (`Workflow/Eval.hs:197-261`). The race then sees only the message case done. Between two resolutions, every IVar is filled before any waiting job runs (`Workflow/Eval.hs:212-242`) and `race` tries its left side first, so first-listed holds.

The SDK has no option to change this. Spec 06 stays the design semantics: write the cases in `.twf` order and add no workaround. The corpus's tie tests in [`messages/haskell/Main.hs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/haskell/Main.hs) assert the SDK's result in both listing orders.

## Notes

- An empty case body → the winner's `claim` or result alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `begin` per message case and a fresh timer each iteration; a deadline bound once as a promise is created before the loop.
