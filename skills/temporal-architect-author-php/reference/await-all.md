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
- `Promise::all` rejects on the first failure and leaves the other branches running (`Promise.php:160-198`). To stop them, run each in a `Workflow::async` scope and cancel the scopes on failure: `temporal-developer` [`references/php/patterns.md` § Parallel Execution](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#parallel-execution), [§ Cancellation Scopes](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#cancellation-scopes).
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

A `for` body of several statements is one `Workflow::async` branch per item, joined by the same `Promise::all`.
