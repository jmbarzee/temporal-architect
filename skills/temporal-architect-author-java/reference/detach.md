# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Java that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow Archive(items)
```

```java
Archive archive =
    Workflow.newChildWorkflowStub(
        Archive.class,
        ChildWorkflowOptions.newBuilder()
            .setParentClosePolicy(ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON)
            .setCancellationType(ChildWorkflowCancellationType.ABANDON)
            .build());
Async.procedure(archive::run, items);
// Resolves once the child has started; a failed start throws here.
Workflow.getWorkflowExecution(archive).get();
// Never read the procedure's promise: it waits for completion.
```

- A child start sets `ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON`, so the parent's close does nothing to the child (`workflow/ChildWorkflowOptions.java:228`), and `ChildWorkflowCancellationType.ABANDON`, so the parent's cancellation is never requested of it (`workflow/ChildWorkflowOptions.java:278`, `workflow/ChildWorkflowCancellationType.java:29-33`). `Async.procedure` starts it without blocking; `Workflow.getWorkflowExecution(stub)` resolves at the child's start (`workflow/Workflow.java:506`), and a failed start throws from it, failing the caller (`internal/statemachines/ChildWorkflowStateMachine.java:219-240`).
- A client start, `detach workflow` in a sync nexus body, has no parent: `WorkflowClient.start(stub::run, arg)` starts the run and returns its `WorkflowExecution` (`client/WorkflowClient.java:408`), and the handler never reads the result ([nexus-service-def.md](./nexus-service-def.md#sync)).

```twf
detach nexus GreeterEndpoint GreeterService.Greet(friend)
```

```java
// Preview: NexusOperationCancellationType is @Experimental.
private final GreeterService detached =
    Workflow.newNexusServiceStub(
        GreeterService.class,
        NexusServiceOptions.newBuilder()
            .setEndpoint("GreeterEndpoint")
            .setOperationOptions(
                NexusOperationOptions.newBuilder()
                    .setCancellationType(NexusOperationCancellationType.ABANDON)
                    .build())
            .build());

// Resolves once the operation starts; a sync operation starts by completing.
Workflow.startNexusOperation(detached::greet, friend).getExecution().get();
// Never getResult(): that waits for the result.
```

- Nexus has no parent-close policy. `NexusOperationCancellationType.ABANDON` keeps the caller's cancellation from reaching the operation; the enum and `setCancellationType` are `@Experimental`, so `detach nexus` is preview in Java (`workflow/NexusOperationCancellationType.java:17,35-38`, `workflow/NexusOperationOptions.java:96-97`).
- The detached call needs its own stub: a stub's operation options apply to every call through it. `Workflow.startNexusOperation(stub::op, arg)` (`workflow/Workflow.java:1828`) returns a handle whose `getExecution()` resolves when the operation starts, or for a sync operation when it completes, and throws its start failure (`workflow/NexusOperationHandle.java:8-19`).
- When the operation finishes after the caller has closed, its completion callback to the caller fails and is dropped; that is server behavior, with no SDK surface to cite.
