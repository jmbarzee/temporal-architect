# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```perl
# ProcessOrder.pm
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class ProcessOrder :isa(Temporalio::Workflow::Definition) {
    async method run :Run ($order) {
        return { status => 'done' };
    }
}

1;
```

A `Temporalio::Workflow::Definition` subclass, alone in its `.pm` ([idioms.md](./idioms.md)), named as the `.twf` names it, else `:Run('Name')` ([SKILL.md](../SKILL.md#wire-names)), with one `async method run :Run`. Params are positional, one payload each; no DSL return type → `return;`; a value is plain data ([types.md](./types.md)). Workflow state is the class's `field`s, which handlers may touch before `run` starts; an initializer that needs the run's params is a `:Init` method (`Workflow/Definition.pm:138-140`, `README.md:488-495`).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```perl
class ShipItem :isa(Temporalio::Workflow::Definition) {
    # id_scheme: "ship-{order.id}-{item.id}"
    sub id ($order_id, $item_id) { return "ship-$order_id-$item_id" }
    ...
}
```

One plain `sub id` per scheme in the workflow's package, taking one argument per hole, called as `ShipItem::id(...)`. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

A type that has a scheme or ID policies, or backs a Nexus run operation, also gets one `start_options` sub returning its ID, task queue and `default_options:` as a key/value list; every client start spreads it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```perl
# Inside class OrderTracker:
sub id ($order_id) { return "tracker-$order_id" }

sub start_options ($order_id) {
    return (id => id($order_id), task_queue => 'fulfillment', id_conflict_policy => 'use_existing');
}

# A client start:
await $client->start_workflow('OrderTracker', [$order_id], OrderTracker::start_options($order_id));
```

`$client->start_workflow($workflow, \@args, %opts)` (`Client.pm:202`) requires `id` and `task_queue` (`Client.pm:513-518`); the args travel in the arrayref.

## Determinism constraints

sdk-perl `README.md` § Workflow logic constraints (`:829-842`) and § Deterministic time, randomness, and logging (`:705-746`); a bare `time`, `rand` or `sleep` in a workflow throws `Temporalio::Exception::Nondeterminism`, failing the workflow task (`Workflow/DeterminismGuard.pm:59-70,86-118`). Changing running workflows: § Versioning (patching) (`:748-761`).
