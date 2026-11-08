# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	activity Charge(order) -> receipt
	close complete(Result{status: "done", receiptId: receipt.id})
```

```php
#[WorkflowInterface]
final class ProcessOrder
{
    #[WorkflowMethod]
    #[ReturnType(Result::class)]
    public function run(Order $order): \Generator
    {
        $receipt = yield Workflow::newActivityStub(OrderActivities::class, self::chargeOptions())->charge($order);
        return new Result('done', $receipt->id);
    }
}
```

A `#[WorkflowInterface]` class named as the `.twf` names it, else `#[WorkflowMethod(name: 'Name')]` ([SKILL.md](../SKILL.md#wire-names)), with one `#[WorkflowMethod]`. Params are positional, one payload each. A method that `yield`s a promise is a generator, so it declares `\Generator` and gives the DSL return type in `#[ReturnType]` (`Workflow/ReturnType.php:24`); `-> (A, B)` is one DTO ([types.md](./types.md)). A body that never yields declares its return type directly, as the corpus's `Audit::run(): bool`. Workflow state is the class's properties, set in a no-argument constructor; one that needs the run's params is `#[WorkflowInit]` (`Workflow/WorkflowInit.php:24`; `temporal-developer` [`advanced-features.md` § Workflow Init Attribute](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/advanced-features.md#workflow-init-attribute)). Forgetting a `yield` or the return attribute: [`gotchas.md` § Generators and Promises](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#generators-and-promises).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```php
final class Shipping
{
    public static function shipItemId(string $orderId, string $itemId): string
    {
        return "ship-{$orderId}-{$itemId}";
    }
}
```

One static ID function per scheme, beside the workflow, taking one argument per hole. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

A type that has a scheme or ID policies also gets one start-options function holding its ID, task queue and `default_options:`; every client start uses it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```php
public static function orderTrackerStartOptions(string $orderId): WorkflowOptions
{
    return WorkflowOptions::new()
        ->withWorkflowId(self::orderTrackerId($orderId))
        ->withTaskQueue(self::FULFILLMENT_TASK_QUEUE)
        ->withWorkflowIdConflictPolicy(WorkflowIdConflictPolicy::UseExisting);
}

$client->start(
    $client->newWorkflowStub(OrderTracker::class, self::orderTrackerStartOptions($orderId)),
    $orderId,
);
```

`WorkflowOptions` is the client's (`Client/WorkflowOptions.php:235-404`); `start` takes the stub, then the run's args (`Client/WorkflowClientInterface.php:41`).

## Determinism constraints

`temporal-developer` [`determinism.md` § Forbidden Operations in Workflows](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/determinism.md#forbidden-operations-in-workflows), [`determinism-protection.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/determinism-protection.md); changing running workflows: [`versioning.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/versioning.md).
