# `.twf` Conventions

Layout and comment conventions the grammar doesn't express.

## Package per domain directory

Give each domain its own package — one directory of `.twf` files sharing a `package` clause — and mirror the code layout, so a domain's `.twf` sits beside the implementation it describes. A topology file that wires domains together is its own package (e.g. `deploy`) that imports them and registers their types by qualified reference:

```twf
# deploy/topology.twf
package deploy

import "github.com/acme/shop/orders"
import "github.com/acme/shop/payments"

worker orderWorker:
	workflow orders.ProcessOrder
	activity payments.ChargeCard
```

Start the module once, at the design's root: `twf mod init github.com/acme/shop` there makes `orders/` the package `github.com/acme/shop/orders` imported above.

A clause-less file is the implicit default package, so single-package designs need none of this. Modules, import paths, assumed names, `/vN` stripping, and aliases: [packages topic](../topics/packages.md) and `twf spec packages-and-imports`; resolution errors: [common-errors.md](./common-errors.md#packages-imports-and-external-references).

## Worker implementation: `@sdk`

An `@sdk` annotation above a worker names the SDK it is written in and, once code exists, its entry file — the one file where the worker is built and its types registered:

```twf
@sdk(go, "cmd/order-worker/main.go")
worker orderWorker:
	workflow orders.ProcessOrder
	activity payments.ChargeCard
```

- **Add it whenever a worker is designed, authored or recovered**: `@sdk(go)` once the SDK is chosen, the path once the code exists. It is never required, and only workers carry it: a workflow, activity or Nexus service takes the SDK of the workers that register it.
- **The path is read from the module root** (the directory of `twf.mod`), else from the `.twf` file's directory, and may use `..`. From the entry file an agent finds every registered type's code. `twf check` warns `IMPL_NOT_FOUND` when the file is missing.
- **One SDK per worker.** A second `@sdk` in another SDK declares a second implementation of the same worker type — see [task-queues.md](../topics/task-queues.md#one-worker-several-sdks).

The [project-discovery subagent](../subagents/project-discovery.md) follows the path to the code; [reverse-engineering](./reverse-engineering.md) writes it when recovering a worker.
