# `.twf` Conventions

How to lay out `.twf` files, group them into packages, and the small set of comment conventions that carry information the grammar doesn't express.

## Package per domain directory

**Recommendation: give each domain its own package — one directory of `.twf` files with a `package` clause — and let the `.twf` layout mirror the code layout.** A package is a directory; every file in it starts with the same `package X` clause; symbols resolve per package.

```twf
# orders/checkout.twf
package orders

workflow ProcessOrder(order: Order) -> (Result):
    activity ChargePayment(order) -> receipt
    close complete(Result{receipt})
```

Cross-package references are **qualified by the package leaf name** and require an explicit `import`:

```twf
# deploy/topology.twf
package deploy

import "github.com/acme/shop/orders"
import "github.com/acme/shop/payments"

worker orderWorker:
    workflow orders.ProcessOrder
    activity payments.ChargeCard
```

- **Package = directory.** One `package X` clause per file, first in the file (before imports and definitions). Files sharing a directory share a package and resolve together; a same-named symbol in a different package no longer collides.
- **`import "<full/module/path>"`** — Go-style, the full module-prefixed path (`github.com/acme/shop/orders`). The path is carried verbatim as a future global-lookup key but is **not enforced** today (a single directory tree is assumed; there is no global package management yet).
- **Reference by leaf name** — the last path segment (`orders`), except a trailing `/vN` version segment is stripped and the preceding segment used (`.../billing/v2` → leaf `billing`). Same-package references stay bare, exactly as before. Use `import alias "path"` when two imports would share a leaf name — notably v1 and v2 of one package, which strip to the same leaf; the alias renames only the local reference, not the target package.
- **A clause-less file is the implicit default package** and behaves exactly as `.twf` did before packages existed — nothing about single-package designs changes, and their node-IDs and error messages are byte-identical.

This restores co-location: the `.twf` for a domain can sit beside (and mirror) the implementation directory it describes, instead of being forced into one flat package to keep references resolving. See the [packages topic](../topics/packages.md) for a worked `package` + `import` + qualified-reference example, and [common-errors.md](./common-errors.md#packages-imports-and-external-references) for how imports interact with resolution.

> **`package` is not `namespace`.** `package` is a compile-time symbol grouping over a directory of `.twf` files with no runtime meaning. `namespace` is the Temporal deployment construct (workers, endpoints) and is unchanged. A topology file that wires domains together is itself just a package (e.g. a `deploy` package) that imports the domains it deploys.

## Comment conventions

`.twf` comments (`#`) are free text to the parser, but a small **named set** carries conventional meaning the tooling and the reader rely on. Use these exact forms.

### Impl-link header

A top-of-file comment linking a `.twf` to the implementation directory (or directories) it describes:

```twf
# impl: order-service/workflows, order-service/activities
package orders

workflow ProcessOrder(order: Order) -> (Result):
    activity ChargePayment(order) -> receipt
    close complete(Result{receipt})

activity ChargePayment(order: Order) -> (Receipt):
    charge(order.payment)
```

Now that packages let the `.twf` layout mirror the code layout, the impl link is usually obvious from co-location — but it is still worth stating explicitly, because the mapping is a convention, not something the tooling enforces, and a package may describe code that lives under a differently-named directory. The header records that mapping in one place. It is also a [reverse-engineering](./reverse-engineering.md) aid: the [project-discovery subagent](./project-discovery-subagent.md) *reads* it to jump straight to the code, and extraction *writes* it when recovering a `.twf` from existing code.

This is the interim, file-level form. The durable, machine-checkable version is per-symbol reference annotations (`@ref`), deferred — see [#24](https://github.com/jmbarzee/temporal-architect/issues/24); when that lands, the per-symbol `@ref` supersedes the file-level header.
