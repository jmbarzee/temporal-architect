# activity call

```twf
activity ValidateOrder(order) -> validated
```

```ts
import { proxyActivities } from '@temporalio/workflow';
import type { createActivities } from './activities';

const { ValidateOrder } = proxyActivities<ReturnType<typeof createActivities>>({ startToCloseTimeout: '1m' });

const validated = await ValidateOrder(order);
```

- Import the activities as a type only (`import type`), so the workflow bundle never loads their code; the proxy's type is `typeof activities` for plain exports, `ReturnType<typeof createActivities>` for a factory ([activity-def.md](./activity-def.md)). `temporal-developer` `references/typescript/gotchas.md` § Activity Imports.
- The property read off the proxy is the activity type it schedules (`workflow/src/workflow.ts`): destructure the `.twf` name; a renamed local binding (`{ ValidateOrder: validate }`) still sends `ValidateOrder`.
- A failed activity rejects the `await`; let it propagate unless the `.twf` handles it.
- Options belong to the proxy ([options.md](./options.md)). An `options:` block on the call gets its own proxy.
- A `task_queue` with `{x}` parameters names one member of a worker family: build that proxy inside the workflow function, where the queue's inputs are, with the family's queue function, and set `scheduleToStartTimeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
