# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In PHP that is: wait for the start, never the result, and keep the caller's close and cancellation from reaching the child.

```twf
detach workflow Archive(items)
```

```php
// Waits for the child's start; never getResult(), which waits for its completion.
$archive = Workflow::newUntypedChildWorkflowStub(
    'Archive',
    ChildWorkflowOptions::new()->withParentClosePolicy(ParentClosePolicy::Abandon),
);
yield $archive->start($items);
```

```php
// worker.php, before WorkerFactory::create()
FeatureFlags::$cancelAbandonedChildWorkflows = false;
```

- `ParentClosePolicy::Abandon` leaves the child alone when the parent closes (`Workflow/ParentClosePolicy.php:24-26`). `start()` sends the start and returns a promise of the child's `WorkflowExecution`, resolved from the SDK's request for that execution (`Internal/Workflow/ChildWorkflowStub.php:66-103`); `getResult()` is never called. The stub is untyped, its name the `.twf` name, because a typed proxy's call also waits for the result (`Internal/Workflow/ChildWorkflowProxy.php:85`).
- The parent's cancellation reaches an Abandon child unless the worker entry file sets `FeatureFlags::$cancelAbandonedChildWorkflows = false`: at its default `true` the child's start is a cancellable request (`Worker/FeatureFlags.php:51`, `Internal/Workflow/ChildWorkflowStub.php:87-90`). The flag is static, so it holds for every workflow in the RoadRunner process; a workflow whose cancellation should still reach its `ABANDON` child runs under another `rr serve`, without the flag. Flags in general: `temporal-developer` [`advanced-features.md` § Feature Flags](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/advanced-features.md#feature-flags).
- Not `withChildWorkflowCancellationType(ChildWorkflowCancellationType::Abandon)`: the option is marshalled as the bool `WaitForCancellation` (`Workflow/ChildWorkflowOptions.php:103`), whose marshaller throws on any value but `WaitCancellationCompleted` and `TryCancel` (`Internal/Marshaller/Type/ChildWorkflowCancellationType.php:24-31`).
- A client start has no parent: `$client->start($stub, ...$args)` starts the run, and the caller never reads its result.

`detach nexus` is unsupported: PHP has no Nexus caller ([nexus.md](./nexus.md)).
