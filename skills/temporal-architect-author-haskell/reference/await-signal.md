# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```haskell
import Arrivals qualified as A

-- in the workflow body:
approves <- A.newArrivals
setSignalHandler approveSignal \approver -> do
  writeStateVar status "approved"
  A.add approves approver
-- ...
approver <- A.take approves
```

Every signal or update the design waits on gets an `Arrivals a`, `a` being its one param, a tuple of several (`(Text, Scientific)`, matched at the take), or `()` for none (`A.add opens ()`). Copy the module from the corpus's [`haskell/Arrivals.hs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/haskell/Arrivals.hs) into the project and import it qualified; [`messages/haskell/Approval.hs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/haskell/Approval.hs), which uses it, is the worked example.

| `Arrivals` | Does |
|------------|------|
| `newArrivals :: Workflow (Arrivals a)` | creates the pending arrivals and the waiter line, in the workflow body |
| `add :: Arrivals a -> a -> Workflow ()` | adds an arrival; the handler calls it last |
| `begin :: Arrivals a -> Workflow Waiter` | puts a waiter at the end of the line |
| `ready :: Arrivals a -> Waiter -> Condition Bool` | whether the arrival the waiter is owed is pending |
| `claim :: Arrivals a -> Waiter -> Workflow a` | gives a ready waiter its arrival and ends it |
| `leave :: Arrivals a -> Waiter -> Workflow ()` | ends a waiter that did not claim |
| `takeAt :: RequireCallStack => Arrivals a -> Waiter -> Workflow a` | waits until ready, then claims |
| `take :: RequireCallStack => Arrivals a -> Workflow a` | `begin`, then `takeAt` |

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- **The line is positional**: the n-th waiter in line is owed the n-th pending arrival, so waiters are served in the order they began. Two facts of the SDK force it. Woken conditions run newest first: a `StateVar` write wakes every condition that read it, and `putIVar` puts the woken jobs at the front of the run queue (`Workflow/Internal/Monad.hs:578-584,652-674`), where each re-runs its condition (`Workflow.hs:1594-1620`). So one `waitCondition` per waiter, then a pop, serves waiters in reverse, as the corpus's naive-mapping test shows. And the SDK has no fork that returns a handle: its concurrency is `race` and the `concurrently` family (`Workflow.hs:162-181`), so a promise cannot be a running waiter; it is a place in line that keeps its arrival while a later waiter takes the next.
- **Never port another SDK's arrivals helper.** Each relies on its own scheduler's wake order; here a queue popped by whichever waiter wakes serves them out of order, and a ticket that only the head of the line may take deadlocks behind a promise that is not running.
- `take` begins waiting when called; a promise begins at its binding with `begin` ([promise.md](./promise.md)).
- An `await one` case checks `ready` and calls `claim` only if it wins, `leave` if it loses ([await-one.md](./await-one.md)).
- Code after the take sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
