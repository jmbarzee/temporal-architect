# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		signal BillingChargeWorkflow.Refund(req)
			id: req.chargeId
		close complete(RefundResult{status: "requested"})
```

```ts
// api.ts: the contract, shared by caller and handler
import * as nexus from 'nexus-rpc';

export const BillingService = nexus.service('BillingService', {
  ChargePayment: nexus.operation<PaymentRequest, PaymentResult>(),
  RefundPayment: nexus.operation<RefundRequest, RefundResult>(),
});
```

```ts
// service.ts: the handler
import * as nexus from 'nexus-rpc';
import { WorkflowRunOperationHandler, getClient, startWorkflow } from '@temporalio/nexus';

export const billingServiceHandler = nexus.serviceHandler(BillingService, {
  // async: workflow-backed; resolves when the workflow completes
  ChargePayment: new WorkflowRunOperationHandler<PaymentRequest, PaymentResult>((ctx, input) =>
    startWorkflow(ctx, BillingChargeWorkflow, { ...billingChargeWorkflowStartOptions(input), args: [input] }),
  ),
  // sync: the body runs in the handler, with a Temporal client, not a workflow
  RefundPayment: async (_ctx, req) => {
    await getClient().workflow.getHandle(req.chargeId).signal('Refund', req);
    return { status: 'requested' };
  },
});
```

`nexus-rpc`'s `service`, `operation` and `serviceHandler` are tagged `@experimental` (`nexus-rpc/lib/service/helpers.d.ts`, `handler/service-handler.d.ts`), though Nexus calls from workflows are GA; they are the only contract API, so use them. `WorkflowRunOperationHandler`, `startWorkflow` and `getClient` carry no such tag (`@temporalio/nexus` `src/workflow-helpers.ts`, `src/context.ts`).

Registration on the **handler** worker (the target namespace's), not the caller: its registrations helper returns `nexusServices: [billingServiceHandler]`, and its workflows module exports the backing workflows ([worker.md](./worker.md)). A `.twf` `nexus service` is one `nexus.serviceHandler` implementing **every** operation it declares — never a subset (`twf check` rejects `nexus service Svc.Op`); operations a design deploys apart are a separate `nexus service`.

## Contract

`nexus.service(name, operations)` names the service; each property key is an operation's wire name unless `nexus.operation({name})` replaces it, so leave `name` unset ([SKILL.md](../SKILL.md#wire-names)). `nexus.operation<I, O>()` carries one input: an operation's several values travel as one declared `interface`, per spec 04. Put the contract in a module both sides import, beside the ID and start-options functions ([workflow-def.md](./workflow-def.md#id_scheme)).

## async

`async Op workflow Name` → `new WorkflowRunOperationHandler<I, O>((ctx, input) => startWorkflow(ctx, Name, {...}))`: any duration; the caller gets a completion callback, with cancellation propagation and re-attachment via operation token. `startWorkflow` is a client start whose `taskQueue` defaults to the handler worker's (`WorkflowStartOptions`, `src/workflow-helpers.ts`); spread the backing workflow's start-options function for a deterministic ID (Nexus retries the start) and its `default_options:`, including both ID policies. A qualified `workflow orders.Name` is `Name` from that package's module ([workflow-call.md](./workflow-call.md)).

The backing workflow's one parameter is the operation's input.

## sync

`sync Op(param) -> (T):` → a plain `async (ctx, input): Promise<T>` handler in the `serviceHandler` map (`SyncOperationHandler`, `nexus-rpc/lib/handler/operation-handler.d.ts`). It must finish within 10 seconds; on handler timeout the caller's Nexus machinery retries until `scheduleToCloseTimeout`. The body holds only client forms, each a client call or plain TypeScript:

| Statement in a sync body | TypeScript |
|---|---|
| `workflow Name(args) [-> r]` (a client start) | `const handle = await getClient().workflow.start(Name, {...nameStartOptions(...), args: [...]})`, then `const r = await handle.result()` ([workflow-call.md](./workflow-call.md)) |
| `detach workflow Name(args)` | the same `start`; never `handle.result()` ([detach.md](./detach.md)) |
| `signal Type.Name(args)` + `id:` | `await getClient().workflow.getHandle(workflowId, runId?).signal('Name', ...args)`; args as in [signal-send.md](./signal-send.md) |
| `close complete(r)` / `close fail(e)` | `return r` / `throw` the error |
| `if` / `for` / `switch` / `break` / `continue`, raw lines (`x = expr`) | TypeScript equivalents ([control-flow.md](./control-flow.md)) |

`TemporalOperationHandler`, which the docs' Nexus guide leads with, is experimental and not used: the plain handler and `WorkflowRunOperationHandler` cover both kinds.
