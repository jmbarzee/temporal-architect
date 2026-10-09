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

A clause-less file is the implicit default package, so single-package designs need none of this. Import paths, leaf names, `/vN` stripping, and aliases: [packages topic](../topics/packages.md) and `twf spec packages-and-imports`; resolution errors: [common-errors.md](./common-errors.md#packages-imports-and-external-references).

## Impl-link header

`.twf` comments (`#`) are free text, except this one named form — a top-of-file comment naming the implementation directories the file describes:

```twf
# impl: order-service/workflows, order-service/activities
package orders

workflow ProcessOrder(order: Order) -> (Result):
    activity ChargePayment(order) -> receipt
    close complete(Result{receipt})

activity ChargePayment(order: Order) -> (Receipt):
    charge(order.payment)
```

State it even when co-location makes it look obvious: the mapping is a convention the tooling doesn't enforce, and a package may describe code under a differently named directory. The [project-discovery subagent](../subagents/project-discovery.md) reads it to jump to the code; [reverse-engineering](./reverse-engineering.md) writes it when recovering a `.twf`. It is the interim file-level form of per-symbol `@ref` annotations ([#24](https://github.com/jmbarzee/temporal-architect/issues/24)), which will supersede it.
