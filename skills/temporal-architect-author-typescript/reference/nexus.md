# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```ts
import { createNexusServiceClient } from '@temporalio/workflow';
import { BillingService } from './api';

const billing = createNexusServiceClient({ endpoint: 'BillingEndpoint', service: BillingService });
const paymentResult = await billing.executeOperation('ChargePayment', order.payment);
```

- `createNexusServiceClient({endpoint, service})` scopes a client to one endpoint + service; `executeOperation(op, input, options?)` starts the operation and awaits its result (`workflow/src/nexus.ts`). Its one `input` is the call's one argument. A failed operation rejects the `await`.
- `service` is the contract object ([nexus-service-def.md](./nexus-service-def.md#contract)), so the operation key is type-checked against it and caller and handler stay in sync. A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, imports `OrderService` from the module generated for the `.twf` package `orders`.
- Options: [options.md](./options.md#nexus-operation-options). Fire-and-forget: [detach.md](./detach.md).
