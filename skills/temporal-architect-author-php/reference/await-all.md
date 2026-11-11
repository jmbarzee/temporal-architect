# await all

```twf
await all:
	activity Count(items) -> count
	workflow Audit(items) -> audited
```

```php
[$count, $audited] = yield Promise::all([$activities->count($items), $audit->run($items)]);
```

- One `Promise::all` (`Temporal\Promise`, `Promise.php:38`) over every branch's promise, whatever its kind; its result is an array in branch order, destructured into the bindings, as the corpus's [`Batch.php`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/php/Batch.php) does.
- `Promise::all` rejects at the first branch failure in time, with that failure (`Promise.php:181-192`), and cancels nothing: the other branches keep running, as spec 06 requires. When two fail, the first to reject surfaces; a later rejection is dropped (`internal/promise` `src/Promise.php:292-297`, at the corpus's `3.4.1`). The corpus's [`JobTest`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/php/JobTest.php) asserts the rule in the main body and in an [update handler](./update-handler.md).
- A `detach` call's branch is its child stub's `start()`, which resolves once the child has started ([detach.md](./detach.md)).
- PHP has no Nexus API, so no branch is a `nexus` call.

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```php
$promises = [];
foreach ($items as $item) {
    $promises[] = $activities->processBatchItem($item);
}
yield Promise::all($promises);
```

A `for` body of several statements is one `Workflow::async` branch per item, joined by the same `Promise::all`, which fails as above: a scope rejects with the failure its body leaves uncaught (`Internal/Workflow/Process/Scope.php:550-557`).
