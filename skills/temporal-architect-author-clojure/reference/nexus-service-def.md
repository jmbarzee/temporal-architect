# nexus service definition

`nexus service Name:` and its `sync` and `async` operations are unsupported in Clojure: the SDK has no Nexus API. No namespace, function or worker option registers a Nexus service handler; its only Nexus keys are worker tuning (`src/temporal/client/worker.clj:145-146,155,159`). There is no interop recipe: the service lives on a worker in another SDK.
