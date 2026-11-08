# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Ruby that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow Archive(items)
```

```ruby
# detach: abandon the child, never request its cancellation, and wait only for its start.
Temporalio::Workflow.start_child_workflow(
  Archive, items,
  parent_close_policy: Temporalio::Workflow::ParentClosePolicy::ABANDON,
  cancellation_type: Temporalio::Workflow::ChildWorkflowCancellationType::ABANDON
)
```

- A child start sets `ParentClosePolicy::ABANDON`, so the parent's close does nothing to the child (`workflow/parent_close_policy.rb:13-14`), and `ChildWorkflowCancellationType::ABANDON`, so the parent's cancellation is never requested of it (`workflow/child_workflow_cancellation_type.rb:9-10`).
- `start_child_workflow` returns once the child has started, and a failed start raises from it, failing the caller (`internal/worker/workflow_instance/outbound_implementation.rb:395-443`). Never call the handle's `result`: it waits for completion.
- A client start, `client.start_workflow(Archive, items, **Archive.start_options(...))` in client code, has no parent: it returns the handle once the run has started (`client.rb:318-321`), and nothing reads the result.

```twf
detach nexus GreeterEndpoint GreeterService.Greet(friend)
```

```ruby
# Experimental: Nexus support, NexusOperationCancellationType included.
greeter = Temporalio::Workflow.create_nexus_client(endpoint: 'GreeterEndpoint', service: 'GreeterService')
# detach: abandon on cancellation, wait only for the operation's start, never its result.
greeter.start_operation('Greet', friend,
                        cancellation_type: Temporalio::Workflow::NexusOperationCancellationType::ABANDON)
```

- Nexus has no parent-close policy. `NexusOperationCancellationType::ABANDON` keeps the caller's cancellation from reaching the operation (`workflow/nexus_operation_cancellation_type.rb:14-15`); the type and the whole Nexus caller are experimental, so `detach nexus` is preview in Ruby (`:9`).
- `start_operation` (`workflow/nexus_client.rb:41-54`) returns a `NexusOperationHandle` once the operation starts, or for a sync operation once it completes, and raises its start failure (`internal/worker/workflow_instance/outbound_implementation.rb:494-512`). Never call the handle's `result` (`workflow/nexus_operation_handle.rb:32`): it waits for the result.
- When the operation finishes after the caller has closed, its completion callback to the caller fails and is dropped; that is server behavior, with no SDK surface to cite.
