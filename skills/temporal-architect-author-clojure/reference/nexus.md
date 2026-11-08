# nexus call

`nexus Endpoint Service.Op(args)` is unsupported in Clojure: the SDK has no Nexus API. No namespace, function or option wraps sdk-java's `Workflow.newNexusServiceStub`; its only Nexus keys are worker tuning (`src/temporal/client/worker.clj:145-146,155,159`). There is no interop recipe: a workflow that calls a Nexus operation lives on a worker in another SDK.
