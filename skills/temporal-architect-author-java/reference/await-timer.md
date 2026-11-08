# await timer

```twf
await timer(5m)
```

```java
Workflow.sleep(Duration.ofMinutes(5));
```

- `Workflow.sleep(Duration)` (`workflow/Workflow.java:879`) takes the `.twf` duration as a `Duration`. A variable duration passes straight through: `Workflow.sleep(backoff)`. Never `Thread.sleep`: `temporal-developer` `references/java/gotchas.md` § Using Thread.sleep.
- A cancelled scope throws `CanceledFailure` from it: `temporal-developer` `references/java/patterns.md` § Cancellation Scopes.
- As a race case or a `promise`, a timer is `Promise<Void> t = Workflow.newTimer(d)` (`:786`); see [await-one.md](./await-one.md).
