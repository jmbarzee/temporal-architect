# nexus call

`nexus Endpoint Service.Op(args)`, its promise, its `await one:` case and its options are unsupported at the pin: Nexus is not implemented (`TODO.md:15`, `docs/temporal_sdk/nexus/-module.md:3`). A workflow that calls a Nexus operation lives on a worker in another SDK.

`start_nexus(endpoint, service, operation, input, opts)` exists (`temporal_sdk/temporal_sdk_workflow.erl:2157-2177`) but cannot carry a call:

- Its command matches no awaitable state transition, so the first one fails as invalid (`api/awaitable/temporal_sdk_api_awaitable_index.erl:614-713`, `api/awaitable/temporal_sdk_api_awaitable_index_table.erl:24`).
- History indexes only `NEXUS_OPERATION_SCHEDULED`; the operation's start and completion are ignored (`api/awaitable/temporal_sdk_api_awaitable_index.erl:899-915,1394-1396`).
- Its key, `{nexus, endpoint, service, operation}`, holds one call per operation (`temporal_sdk/temporal_sdk_workflow.erl:2168-2171`).
- Its options are `schedule_to_close_timeout` alone (`:290-303`).
