# options

Option keys map to camelCase fields (`start_to_close_timeout` → `startToCloseTimeout`), with three exceptions: `retry_policy:` → `retry` (a `RetryPolicy`: `initialInterval`, `backoffCoefficient`, `maximumInterval`, `maximumAttempts`, `nonRetryableErrorTypes`; `common/src/retry-policy.ts`); `priority:` → `priority: {priorityKey, fairnessKey, fairnessWeight}` (`common/src/priority.ts`); `request_eager_execution` → `allowEagerDispatch` (default `true`; `common/src/activity-options.ts`). A duration is an `ms` string as written in the `.twf` (`'2m'`, `'1d'`) or milliseconds.

## Activity options

```twf
activity UnreliableService(data) -> result
	options:
		start_to_close_timeout: 2m
		retry_policy:
			maximum_attempts: 5
			initial_interval: 1s
			backoff_coefficient: 2.0
			maximum_interval: 60s
```

```ts
const { UnreliableService } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2m',
  retry: { maximumAttempts: 5, initialInterval: '1s', backoffCoefficient: 2, maximumInterval: '60s' },
});

const result = await UnreliableService(data);
```

Options belong to the proxy (`ActivityOptions`, `common/src/activity-options.ts`): a call with its own `options:` gets its own `proxyActivities` object at module scope. Every proxy needs `startToCloseTimeout` or `scheduleToCloseTimeout`, or `proxyActivities` throws (`workflow/src/workflow.ts`); with no `options:` anywhere, the module's one proxy sets `startToCloseTimeout`.

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```ts
const childResult = await executeChild(ChildWorkflow, {
  args: [input.data],
  workflowExecutionTimeout: '1h',
  parentClosePolicy: ParentClosePolicy.REQUEST_CANCEL,
  retry: { maximumAttempts: 3 },
});
```

`ChildWorkflowOptions` (`workflow/src/interfaces.ts`) sits beside `args` in the call: `taskQueue`, `workflowExecutionTimeout`, `workflowRunTimeout`, `workflowTaskTimeout`, `workflowIdReusePolicy`, `retry`, `priority`, `parentClosePolicy`. `ParentClosePolicy` is `TERMINATE` (default), `REQUEST_CANCEL` or `ABANDON`.

## Nexus operation options

A `nexus` call's options are exactly its three timeouts, the third argument of `executeOperation`/`startOperation` (`StartNexusOperationOptions`, `workflow/src/interceptors.ts`): `schedule_to_close_timeout` → `scheduleToCloseTimeout`, `schedule_to_start_timeout` → `scheduleToStartTimeout`, `start_to_close_timeout` → `startToCloseTimeout`, which bounds an async operation after its start.

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
	options:
		schedule_to_close_timeout: 1h
```

```ts
const billing = createNexusServiceClient({ endpoint: 'BillingEndpoint', service: BillingService });
const paymentResult = await billing.executeOperation('ChargePayment', payment, { scheduleToCloseTimeout: '1h' });
```

## Definition-level `default_options:`

A `default_options:` block on an `activity` or `workflow` definition supplies defaults for every call of it; a call site's `options:` overrides per key, and a nested block (`retry_policy`, `priority`) replaces the default whole (`twf spec statement-syntax`, Definition Default Options). `parent_close_policy` is call-site only.

```twf
activity ChargeCard(card, amount) -> receipt
	default_options:
		start_to_close_timeout: 30s
		retry_policy:
			maximum_attempts: 5
```

A const options object beside the definition, spread at each call, is that rule: a spread replaces a key, and the nested `retry` object with it.

```ts
export const chargeCardDefaults: ActivityOptions = { startToCloseTimeout: '30s', retry: { maximumAttempts: 5 } };

const { ChargeCard } = proxyActivities<typeof activities>(chargeCardDefaults);
const { ChargeCard: chargeTip } = proxyActivities<typeof activities>({ ...chargeCardDefaults, retry: { maximumAttempts: 1 } });
```

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE`; `workflow_id_conflict_policy` → `workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING` (`common/src/workflow-options.ts`). Where each lands depends on the start kind:

- **Client start** (sync nexus body, async operation, client code): both, from the type's start-options function ([workflow-def.md](./workflow-def.md#id_scheme)). A conflict under `FAIL` throws `WorkflowExecutionAlreadyStartedError` (`client/src/workflow-client.ts`). Update-with-start requires a conflict policy (`WithStartWorkflowOperation`, same file); supply one when the type declares none.
- **Child start**: `ChildWorkflowOptions` omits `workflowIdConflictPolicy`, so it takes the reuse policy only; a start onto a running ID rejects with `WorkflowExecutionAlreadyStartedError` (`workflow/src/internals.ts`).

## Timeouts and retries

`temporal-developer` `references/typescript/error-handling.md` § Timeout Configuration, § Retry Configuration.
