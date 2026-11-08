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
- `all_of` fails at the first failure without waiting for the rest (`workflow/future.rb:26-27,35`); the other branches keep running. `try_all_of` waits for every branch whatever its outcome (`workflow/future.rb:59-64`). To cancel the others, give the branches a shared `Temporalio::Cancellation` and cancel it on failure (`temporal-developer` `references/ruby/patterns.md` § Cancellation (Token-based)).
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

`all_of` takes the futures splatted (`workflow/future.rb:33`). Parallel execution: `temporal-developer` `references/ruby/patterns.md` § Parallel Execution.
