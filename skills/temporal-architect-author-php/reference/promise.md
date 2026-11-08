# promise

A promise is a started call: the call starts when it is made, and `yield` only waits for it. Default to an inline call (`yield` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```php
$handleA = $activities->processA($items->a);
// ... do other work ...
$resultA = yield $handleA;
```

| `promise p <- …` | PHP |
|------------------|-----|
| `activity` / `workflow` | the un-yielded promise of the activity stub's or child stub's method call ([activity-call.md](./activity-call.md), [workflow-call.md](./workflow-call.md)) |
| `timer(5m)` | `Workflow::timer(300)`; one that is also an `await one` case is a `Workflow::async` scope over it whose `then` sets a flag, as the corpus's `Fixtures/BoundDeadline.php` binds its deadline ([await-one.md](./await-one.md#cases)) |
| `nexus …` | unsupported: PHP has no Nexus API |
| `signal Approve` / `update Review` | `$this->approves->take()` |

- A promise on a signal or update begins waiting at its binding, not at its `yield`: `take()` draws its waiter's ticket on the message's `Arrivals` when called ([await-signal.md](./await-signal.md)), as the corpus's `$approval = $this->approves->take();` does.
- In `await one:`, a promise is a case whose flag its `then` sets ([await-one.md](./await-one.md#cases)); losing a round never cancels it.
