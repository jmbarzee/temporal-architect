# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Haskell that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow NotifyCustomer(order.customer)
```

```haskell
h <-
  startChildWorkflow
    notifyCustomer
    defaultChildWorkflowOptions
      { Child.parentClosePolicy = ParentClosePolicyAbandon
      , Child.cancellationType = ChildWorkflowCancellationAbandon
      }
    order.customer
-- Resolves once the child has started; a failed start throws here.
waitChildWorkflowStart h
-- Never wait h: that waits for completion.
```

- A child start is `startChildWorkflow` with `ParentClosePolicyAbandon`, so the parent's close does nothing to the child (`Workflow/Types.hs:213-222`), and `ChildWorkflowCancellationAbandon`, so the parent's cancellation is never requested of it (`Workflow/Types.hs:191-200`). It is the default, set here so the start states both. `startChildWorkflow` returns before the start; `waitChildWorkflowStart` resolves at it (`Workflow/Unsafe/Handle.hs:99-102`), and a failed start throws from it, failing the caller (`WorkflowInstance.hs:804-829`).
- A client start, `detach workflow` in a sync nexus body, has no parent: `Temporal.Client.start` starts the run and returns a handle, and the handler never calls `waitWorkflowResult` ([nexus-service-def.md](./nexus-service-def.md#sync)).

```twf
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(Confirmation{customer: order.customer, payment: paymentResult})
```

**`detach nexus` is unsupported at the pin.** Neither half of the mapping is reachable:

- **No ABANDON.** `NexusOperationAbandon` is a constructor of `NexusOperationCancellationType`, defined in `Temporal.Workflow.Types` (`Workflow/Types.hs:415-423`), a hidden module (`sdk/temporal-sdk.cabal:71`) that no exposed module re-exports, so a call's `cancellationType` stays at its default `NexusOperationTryCancel` (`Workflow/Types.hs:459-465`): a cancelled caller requests the operation's cancellation.
- **No wait for the start alone.** `startNexusOperation` returns one `Task` whose wait covers the start and the result together (`Workflow.hs:546,565-567`).

The `.twf` stays as written. Where the code must still make the call, it starts the operation and never waits its `Task`, with a comment naming both gaps, as the corpus's `Caller` does:

```haskell
-- detach: never waited on. The cancellation type stays the default TryCancel:
-- ABANDON is unreachable at the pin, and there is no wait for the start alone.
_ <-
  startNexusOperation
    (makeNexusClient "NotificationsEndpoint" "NotificationsService")
    "SendConfirmation"
    defaultScheduleNexusOperationOptions
    (encodeJSON Confirmation {customer = order.customer, payment = paymentResult})
```

A failed start then goes unseen, and the caller's cancellation reaches the operation; say so to the user when the design relies on either.
