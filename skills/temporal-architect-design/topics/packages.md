# Packages and Imports

> **Example:** [`packages.twf`](./packages.twf)

A package groups a directory of `.twf` files so references cross file and directory boundaries and one short name can live in two domains without colliding. It is a **compile-time symbol grouping with no runtime effect** — unrelated to `namespace`, which is the Temporal deployment construct.

## When to Use Packages

| Situation | Guidance |
|-----------|----------|
| A single small design, one directory | A clause-less file (the **implicit default package**) is fine. |
| Multiple domains (orders, payments, notifications) | One package/directory per domain, mirroring the code layout ([conventions](../reference/twf-conventions.md#package-per-domain-directory)). |
| Two domains use the same short name (`ChannelJoin`, `CreateNamespace`) | Packages keep both — reference each by its package leaf name; no rename. |
| A topology / deployment file wiring domains together | Make it its own package (e.g. `deploy`) that `import`s the domains it deploys. |
| A service genuinely lives in another system / repo | `import` its package; if it isn't in the tree the import is **treated as external**. |

## The Three Constructs

### `package` clause

`package orders` — at most one per file, before any `import` or definition; every file in a directory shares it. Clause-less files belong to the implicit default package, which is elided from all names and diagnostics.

### `import` declaration

```twf
import "github.com/acme/shop/payments"                # referenced as: payments
import billing "github.com/acme/shop/billing"         # referenced as: billing
import billingv2 "github.com/acme/shop/billing/v2"    # strips to leaf billing too → aliased billingv2 to avoid the clash
```

- The string is the **full module-prefixed path**, carried verbatim as a future global-lookup key; it is **not enforced** today (a single directory tree is assumed).
- Reference the package by its **leaf name** — the last path segment, except a trailing `/vN` is stripped and the preceding segment used (`.../billing/v2` → `billing`), Go's `importPathToAssumedName` rule.
- Alias (`import alias "path"`) only to disambiguate a leaf clash — canonically v1 and v2 of one package. The alias renames only the **local** reference; the target is always the version-stripped leaf.

### Qualified reference

`pkg.Name` — e.g. `activity payments.ChargeCard(order)`, `workflow orders.ProcessOrder(order)`.

- **Same-package references stay bare.**
- A qualifier is recognized only in **keyword-led call positions**: activity, workflow, worker registration, the nexus **service** reference, and an async op's backing workflow.

## Nexus Across Packages

Nexus mirrors Temporal's registries, so its three reference kinds qualify differently — in `nexus Gateway payments.PaymentService.Charge(order)`:

| Kind | Scope | Qualification |
|------|-------|---------------|
| **Endpoint** (`Gateway`) | Flat-global (cluster-global registry) | **Never qualified.** A cross-package duplicate endpoint name is still an error. |
| **Service** (`payments.PaymentService`) | Package-scoped | **Qualified cross-package** by leaf name (or alias); bare within its own package. |
| **Operation** (`Charge`) | Member of its service | **Never independently qualified** — the trailing `.Op` on its service. |

To reach a service in another package, define the endpoint locally (it is part of *your* deployment topology) and qualify + import the service.

## External by Unresolved Import

An `import` of a package not in the tree is treated as external — rules in [common-errors.md](../reference/common-errors.md#packages-imports-and-external-references). In the example, `payments` is external; `twf check` exits 0 with one `UNRESOLVED_IMPORT` warning.
