# Packages and Imports

> **Example:** [`packages/orders/orders.twf`](./packages/orders/orders.twf), with its module's [`twf.mod`](./packages/twf.mod)

A package groups a directory of `.twf` files so references cross file and directory boundaries and one short name can live in two domains without colliding. It is a **compile-time symbol grouping with no runtime effect** — unrelated to `namespace`, which is the Temporal deployment construct.

## When to Use Packages

| Situation | Guidance |
|-----------|----------|
| A single small design, one directory | A clause-less file (the **implicit default package**) is fine. |
| Multiple domains (orders, payments, notifications) | One package/directory per domain, mirroring the code layout ([conventions](../reference/twf-conventions.md#package-per-domain-directory)). |
| Two domains use the same short name (`ChannelJoin`, `CreateNamespace`) | Packages keep both — reference each by its import's qualifier; no rename. One worker cannot register both (`WORKER_DUPLICATE_TYPE_NAME`). |
| A topology / deployment file wiring domains together | Make it its own package (e.g. `deploy`) that `import`s the domains it deploys. |
| A service genuinely lives in another system / repo | `import` its package; if it isn't in the tree the import is **treated as external**. |

## Start with a Module

A packaged design needs a `twf.mod` at its root: run `twf mod init <module path>` there (with no argument it suggests one, from the design's imports or the Git remote). A package's import path is the module path joined with its directory below the root, so each package lives in its own directory: `module github.com/acme/shop` makes `orders/` the package `github.com/acme/shop/orders`. A file with a `package` clause and no `twf.mod` above it is `PACKAGE_OUTSIDE_MODULE` and is ignored. Clause-less files need no module. Check the design on disk from its root (`twf check .`); a lone file's imports of its sibling packages are `IMPORT_NOT_LOADED`.

## The Three Constructs

### `package` clause

`package orders` — one identifier, the file's first clause; every file in a directory shares it. The name must be the import path's last element, with a trailing `/vN` dropped (`…/orders/v1` → `orders`); when that element cannot be a name (`library-temporal-kube`), any name is allowed and importers alias it. Clause-less files belong to the implicit default package, which is elided from all names and diagnostics.

### `import` declaration

```twf
import "github.com/acme/shop/payments"                # referenced as: payments
import billing "github.com/acme/shop/billing"         # referenced as: billing
import billingv2 "github.com/acme/shop/billing/v2"    # assumed name billing too → aliased billingv2 to avoid the clash
```

- The string is the package's **full import path** (module path + directory).
- An import reaches **only the package with exactly that path** — a typo under your own module is `IMPORT_NOT_FOUND`, not a silent external.
- Reference the package by the path's **assumed name** — the last element, a trailing `/vN` dropped (`.../billing/v2` → `billing`).
- Alias (`import alias "path"`) when two imports would share a qualifier — two `fabric` packages at different paths, or v1 and v2 of one package — or when the assumed name cannot be a name (`library-temporal-kube`). The alias renames only the **local** reference.

### Qualified reference

`pkg.Name` — e.g. `activity payments.ChargeCard(order)`, `workflow orders.ProcessOrder(order)`.

- **Same-package references stay bare.**
- A qualifier is recognized only in **keyword-led call positions**: activity, workflow, worker registration, the nexus **service** reference, and an async op's backing workflow.

## Nexus Across Packages

Nexus mirrors Temporal's registries, so its three reference kinds qualify differently — in `nexus Gateway payments.PaymentService.Charge(order)`:

| Kind | Scope | Qualification |
|------|-------|---------------|
| **Endpoint** (`Gateway`) | Flat-global (cluster-global registry) | **Never qualified.** A cross-package duplicate endpoint name is still an error. |
| **Service** (`payments.PaymentService`) | Package-scoped | **Qualified cross-package** by the import's qualifier (or alias); bare within its own package. |
| **Operation** (`Charge`) | Member of its service | **Never independently qualified** — the trailing `.Op` on its service. |

To reach a service in another package, define the endpoint locally (it is part of *your* deployment topology) and qualify + import the service.

## External by Unresolved Import

An `import` of a package not in the tree is treated as external — rules in [common-errors.md](../reference/common-errors.md#packages-imports-and-external-references). In the example, `payments` lives in another module, so it is external; `twf check` exits 0 with one `UNRESOLVED_IMPORT` warning.
