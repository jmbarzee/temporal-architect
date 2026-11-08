# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```ruby
module Orders
  class ProcessOrder < Temporalio::Workflow::Definition
    def execute(order)
      order = Order.from_h(order)
      Result.new(status: 'done')
    end
  end
end
```

A `Temporalio::Workflow::Definition` subclass named as the `.twf` names it, with `workflow_name` unset ([SKILL.md](../SKILL.md#wire-names)), whose `execute` is the run (`workflow/definition.rb:495`). Params are positional, one payload each, and a user type arrives as a `Hash` to rebuild with `from_h` ([types.md](./types.md#user-types)); no DSL return type → `nil`; `-> (A, B)` → one `Data`. Workflow state is instance variables set in `initialize`, which runs before any handler (`internal/worker/workflow_instance.rb:201-204`); an `initialize` that needs the run's params is marked `workflow_init` (`workflow/definition.rb:122`; `temporal-developer` `references/ruby/advanced-features.md` § Workflow Init Decorator).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```ruby
class ShipItem < Temporalio::Workflow::Definition
  def self.workflow_id(order_id, item_id) = "ship-#{order_id}-#{item_id}"

  def execute(order, item)
    # ...
  end
end
```

One class method per scheme, on the workflow's class, taking one argument per hole. A class method is not a handler, so registration ignores it; only a handler's own method name is reserved on the class (`workflow/definition.rb:347-361`). Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

**One ID function for every start and send.** An `id:` is the full workflow ID, so every path to one run renders the scheme through this one method: the child start, each `id:` send, and every client start. A workflow that backs a Nexus `async` operation is started by that operation's handler in another SDK ([nexus-service-def.md](./nexus-service-def.md)); a client start of it in Ruby still calls this method, and the handler's ID function must render the same scheme. A learned `id:` is already the full ID and passes as is.

A type with ID policies or other `default_options:` also gets one start-options class method holding its ID, task queue and those defaults; every client start splats it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```ruby
# On OrderTracker:
def self.start_options(order_id)
  {
    id: workflow_id(order_id),
    task_queue: FULFILLMENT_TASK_QUEUE,
    id_conflict_policy: Temporalio::WorkflowIDConflictPolicy::USE_EXISTING
  }
end

client.start_workflow(OrderTracker, order_id, **OrderTracker.start_options(order_id))
```

The `Hash` holds keywords of `Client#start_workflow` (`client.rb:321-341`); add a key when a type's `default_options:` sets one. The task queue is a constant of the package module, which the worker factory uses too ([worker.md](./worker.md)).

## Determinism constraints

`temporal-developer` `references/ruby/determinism.md` § Forbidden Operations in Workflows, § Safe Builtin Alternatives to Common Non Deterministic Things, and `determinism-protection.md`; changing running workflows: `references/ruby/versioning.md`.
