# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```ts
const billing = createNexusServiceClient({ endpoint: 'BillingEndpoint', service: BillingService });
const [inventory, payment] = await Promise.all([
  ReserveInventory(order),
  billing.executeOperation('ChargePayment', order.payment),
]);
```

- One `Promise.all` over every branch's promise, whatever its kind; the results destructure in branch order.
- A `detach` call's branch is its `startChild` / `startOperation`, which resolves once the call has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```ts
await Promise.all(items.map((item) => ProcessBatchItem(item)));
```

## A branch fails

Both forms meet spec 06's rule as written:

- `Promise.all` rejects at the first branch to fail, with its error (ECMA-262 § Promise.all). When two fail, the first in time surfaces; the later rejection is absorbed, not reported as unhandled.
- The other branches keep running: a call is cancelled only when its `CancellationScope` is (an activity at `workflow/src/workflow.ts:237`, a child at `:461`, a Nexus operation at `workflow/src/nexus.ts:309`), and `Promise.all` cancels none. Wrapping the branches in a scope cancelled on failure is a departure from spec 06, not an option.
- Uncaught in the main body or a signal handler, the failure fails the run (`workflow/src/internals.ts:682`, `:1224`), which pushes only the fail command (`:1407`). In an update handler, a `TemporalFailure` (`ActivityFailure`, `ChildWorkflowFailure`, `NexusOperationFailure`) fails only that update, and the run goes on (`:1101`).

[`corpus/failure/typescript/`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/typescript/) is the worked example.
