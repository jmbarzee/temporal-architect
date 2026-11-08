# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		signal BillingChargeWorkflow.Refund(req)
			id: "charge-{req.chargeId}"
		close complete(RefundResult{status: "requested"})
```

```perl
# BillingService.pm: the handler
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Nexus::Definition;
use BillingChargeWorkflow;

class BillingService :isa(Temporalio::Nexus::Definition) {
    # async: workflow-backed; resolves when the workflow completes
    async method charge_payment :WorkflowRunOperation('ChargePayment') ($ctx, $input) {
        return await $ctx->start_workflow('BillingChargeWorkflow', [$input],
            id         => BillingChargeWorkflow::id($input->{chargeId}),
            task_queue => $ctx->info->task_queue);
    }

    # sync: the body runs in the handler, with a Temporal client, not a workflow
    async method refund_payment :SyncOperation('RefundPayment') ($ctx, $req) {
        await $ctx->client->get_workflow_handle(BillingChargeWorkflow::id($req->{chargeId}))
            ->signal('Refund', [$req]);
        return { status => 'requested' };
    }
}

1;
```

`BillingChargeWorkflow::id` is the backing workflow's `id_scheme:` sub, `charge-{chargeId}` ([workflow-def.md](./workflow-def.md#id_scheme)).

Registration on the **handler** worker (the target namespace's), not the caller: its `worker` sub lists `nexus_services => ['BillingService']`, one shared instance (`Worker/NexusRegistry.pm:41-64`), and the backing workflows ([worker.md](./worker.md)). A `.twf` `nexus service` is one class implementing **every** operation it declares — never a subset: there is no contract to check, so a missing operation surfaces only when a call to it fails with `NOT_FOUND` (`Worker/NexusDispatcher.pm:235-241`), and `twf check` rejects `nexus service Svc.Op`. Operations a design deploys apart are a separate `nexus service`.

## Contract

There is no contract type on either side: the handler class *is* the service, and a caller names service and operation by string ([nexus.md](./nexus.md)). The class is named as the `.twf` service, its registered name by default (`Nexus/Definition.pm:96-101`); each operation method sets its `.twf` name in its attribute ([SKILL.md](../SKILL.md#wire-names)). Every handler takes `($ctx, $input)`: one input per operation, so an operation's several values travel as one hashref, per spec 04.

## async

`async Op workflow Name` → `async method op :WorkflowRunOperation('Op') ($ctx, $input) { return await $ctx->start_workflow('Name', [$input], %opts) }` (`Nexus/Definition.pm:67-75`): any duration; `$ctx->start_workflow` threads the caller's completion callback onto the start, so the caller gets the workflow's result when it completes (`Nexus/OperationContext.pm:145-186`, `README.md:1180-1185`). It is a client start, which requires `id` and `task_queue` and **defaults neither** (`Client.pm:513-518`): pass the backing workflow's ID sub for a deterministic ID (Nexus retries the start) and `task_queue => $ctx->info->task_queue`, the handler worker's queue, where the backing workflow is registered. A type with `default_options:` ID policies spreads its `start_options` sub first, with `task_queue => $ctx->info->task_queue` after it. A qualified `workflow orders.Name` is still `'Name'`.

The backing workflow's one parameter is the operation's input.

## sync

`sync Op(param) -> (T):` → `method op :SyncOperation('Op') ($ctx, $input) { … }`, its return value the result (`Nexus/Definition.pm:58-65`); make it an `async method` when the body awaits a client call (the dispatcher accepts a value or a future, `Worker/NexusDispatcher.pm:508-512`). The body holds only client forms, each a call on `$ctx->client`, the handler worker's `Temporalio::Client` (`Nexus/OperationContext.pm:39-61`), or plain Perl:

| Statement in a sync body | Perl |
|---|---|
| `workflow Name(args) [-> r]` (a client start) | `my $h = await $ctx->client->start_workflow('Name', [...], %opts)`, `%opts` per [workflow-def.md](./workflow-def.md#id_scheme), then `my $r = await $h->result` (`Client.pm:202`, `Client/WorkflowHandle.pm:56`) |
| `detach workflow Name(args)` | the same `start_workflow`; never `->result` ([detach.md](./detach.md)) |
| `signal Type.Name(args)` + `id:` | `await $ctx->client->get_workflow_handle($workflow_id, run_id => $run_id)->signal('Name', [...])` (`Client.pm:117-130`, `Client/WorkflowHandle.pm:329`); `$workflow_id` and args as in [signal-send.md](./signal-send.md) |
| `close complete(r)` / `close fail(e)` | `return $r` / `Temporalio::Exception::Application->throw(...)` ([close.md](./close.md)) |
| `if` / `for` / `switch` / `break` / `continue`, raw lines (`x = expr`) | Perl equivalents ([control-flow.md](./control-flow.md)) |

`id:` is the whole workflow ID (`twf spec cross-workflow-signals`), so `RefundPayment` signals the workflow `ChargePayment` started by calling the ID sub that start uses, `BillingChargeWorkflow::id`.
