# await timer

```twf
await timer(5m)
```

```haskell
sleep (minutes 5)
```

- `sleep :: Duration -> Workflow ()` (`Workflow.hs:1468-1472`) takes the `.twf` duration as a `Temporal.Duration.Duration`. A variable duration passes straight through: `sleep backoff`. A duration of zero or less creates no timer and returns at once (`Workflow.hs:1431-1436`).
- Never `threadDelay`: `IO` is a type error in a workflow ([idioms.md § determinism](./idioms.md#determinism)).
- A timer that may lose a race is `createTimer d`, which returns a `Maybe Timer` (`Nothing` for d ≤ 0) to `wait` and `cancel` (`Workflow.hs:1431,1498-1531`). Inside `await one:` or a `promise`, see [await-one.md](./await-one.md).
