# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```ruby
billing = Temporalio::Workflow.create_nexus_client(endpoint: 'BillingEndpoint', service: 'BillingService') # nexus.md
inventory = Temporalio::Workflow::Future.new do
  Temporalio::Workflow.execute_activity(ReserveInventory, order, start_to_close_timeout: 60)
end
payment = Temporalio::Workflow::Future.new do
  billing.execute_operation('ChargePayment', order.payment)
end
Temporalio::Workflow::Future.all_of(inventory, payment).wait
```

- One `Workflow::Future.all_of(…).wait` over every branch's [promise](./promise.md), whatever its kind (`workflow/future.rb:33-40`); each result is then its future's `result`, as the corpus's `Batch` reads `count.result`.
- `all_of` fails at the first branch failure, with that failure (`workflow/future.rb:33-40`), and cancels nothing: the other branches keep running, as spec 06 requires. Not `try_all_of`, which waits out every branch whatever its outcome (`workflow/future.rb:59-64`). The corpus's `JobTest` asserts the rule in the main body and in an [update handler](./update-handler.md).
- The failure raised is the first in time: every fiber settles before a wait condition is checked (`internal/worker/workflow_instance/scheduler.rb:36-39,45-66`). Two that fail in the same workflow task surface the first in argument order (`workflow/future.rb:37`); the other is dropped.
- A `detach` call's branch is a future over its start (`start_child_workflow` or `start_operation`), which resolves once the call has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```ruby
branches = items.map do |item|
  Temporalio::Workflow::Future.new do
    Temporalio::Workflow.execute_activity(ProcessBatchItem, item, start_to_close_timeout: 60)
  end
end
Temporalio::Workflow::Future.all_of(*branches).wait
```

`all_of` takes the futures splatted (`workflow/future.rb:33`) and fails at the first branch failure, as above. Parallel execution: `temporal-developer` `references/ruby/patterns.md` § Parallel Execution.
