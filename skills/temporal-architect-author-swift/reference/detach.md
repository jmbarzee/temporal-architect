# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Swift that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow Archive(items)
```

```swift
// Returns once the child has started; a failed start throws here. Never call result().
_ = try await context.startChildWorkflow(
    Archive.self,
    options: ChildWorkflowOptions(parentClosePolicy: .abandon, cancellationType: .abandon),
    input: items
)
```

- A child start sets parent-close policy `.abandon`, so the parent's close does nothing to the child, and cancellation type `.abandon`, so the parent's cancellation is never requested of it (`Temporal/Worker/Workflow/ChildWorkflowOptions.swift:197,200`; `Temporal/Worker/Workflow/ChildWorkflowCancellationType.swift:48-53`). The defaults are `.terminate` and `.waitCancellationCompleted`.
- `context.startChildWorkflow` (`Temporal/Worker/Workflow/WorkflowContext.swift:860`) returns the handle once the start resolves, and a failed start throws from it, failing the caller (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:357-386`). Discard the handle: its `result()` waits for completion.
- A client start, `client.startWorkflow(type:options:input:)` (`Temporal/Client/TemporalClient+WorkflowHandle.swift:46`), has no parent: it starts the run and returns a handle whose result is never read.

```twf
detach nexus GreeterEndpoint GreeterService.Greet(friend)
```

**`detach nexus` is unsupported in Swift**: swift-temporal-sdk 1.5.0 has no Nexus, so a workflow has no Nexus call to detach ([nexus.md](./nexus.md)).
