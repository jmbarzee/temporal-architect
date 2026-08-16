# Packages and Imports

> **Example:** [`packages.twf`](./packages.twf)

Packages group a directory of `.twf` files so references can cross file and directory boundaries, and so the same short name can live in two domains without colliding. A package is a **compile-time symbol grouping** — it is *not* the Temporal `namespace` (see [Package vs. namespace](#package-vs-namespace)).

## When to Use Packages

| Situation | Guidance |
|-----------|----------|
| A single small design, one directory | A clause-less file (the **implicit default package**) is fine — nothing changes. |
| Multiple domains (orders, payments, notifications) | Give each domain its own package/directory; mirror the code layout. |
| Two domains use the same short name (`ChannelJoin`, `CreateNamespace`) | Packages keep both — reference each by its package leaf name; no rename. |
| A topology / deployment file wiring domains together | Make it its own package (e.g. `deploy`) that `import`s the domains it deploys. |
| A service genuinely lives in another system / repo | `import` its package; if it isn't in the tree the import is **treated as external**. |

See [`.twf` Conventions](../reference/twf-conventions.md#package-per-domain-directory) for the layout recommendation.

---

## The Three Constructs

### `package` clause

The first line of a file names its package. Every file in a directory shares the clause; they resolve together.

```twf
package orders
```

- **At most one** `package` clause per file, before any `import` or definition.
- Files without a clause belong to the **implicit default package**, which is elided from all names and diagnostics — existing single-package designs are unaffected.

### `import` declaration

After the package clause, import the packages you reference across boundaries:

```twf
import "github.com/acme/shop/payments"          # referenced as: payments
import billingv2 "github.com/acme/shop/billing/v2"   # aliased: billingv2
```

- The string is the **full module-prefixed path**, carried verbatim as a future global-lookup key. It is **not enforced** today (a single directory tree is assumed; no global package management yet).
- Reference the package by its **leaf name** (the last path segment) — `payments`.
- Use the **alias form** (`import alias "path"`) only to disambiguate when two imports would share a leaf name.

### Qualified reference

Reference a symbol in an imported package by `pkg.Name`:

```twf
activity payments.ChargeCard(order)                     # cross-package activity
workflow orders.ProcessOrder(order)                     # cross-package workflow
nexus Gateway payments.PaymentService.Charge(order)     # cross-package nexus service
```

- **Same-package references stay bare** — exactly as before packages existed.
- A qualifier is only recognized in **keyword-led call positions** (activity / workflow / worker-registration / the nexus **service** reference / an async op's backing workflow).
- **Endpoints are never qualified** — they are flat-global (see below). **Operations** are never independently qualified; they ride on their (possibly qualified) service as the trailing `.Op`.

---

## Nexus Across Packages

Nexus is faithful to Temporal's registries, so its three reference kinds qualify differently:

| Kind | Scope | Qualification |
|------|-------|---------------|
| **Endpoint** | Flat-global (cluster-global registry) | **Never qualified.** `nexus Gateway …`. A cross-package duplicate endpoint name is still an error. |
| **Service** | Package-scoped | **Qualified cross-package** by leaf name (or alias): `payments.PaymentService`. Bare within its own package. |
| **Operation** | Member of its service | **Never independently qualified.** Selected off the service by the trailing `.Op`. |

So in `nexus Gateway payments.PaymentService.Charge(order)`: `Gateway` is the flat-global endpoint (unqualified), `payments.PaymentService` is the package-qualified service, and `Charge` is the operation. To reach a service in another package you must define the endpoint locally (it is part of *your* deployment topology) and qualify + import the service. See [nexus.md](./nexus.md).

---

## External by Unresolved Import

An `import` whose package isn't in the tree is **not an error** — it is a `UNRESOLVED_IMPORT` **warning** and every qualified reference through it resolves **as external** (no `UNDEFINED_*`). This is how packages absorb the old "declared elsewhere" problem: **external is something you declare** — by importing a package that isn't present — rather than something the tool infers. In the [example](./packages.twf), `payments` is external, so `payments.PaymentService.Charge` resolves cleanly and `twf check` exits 0 with a single "treated as external" warning.

This also **retired the old nexus resolution cliff**: undefined endpoints and services are now plain hard errors, and there are no local stub definitions to add. See [common-errors.md](../reference/common-errors.md#packages-imports-and-external-references).

---

## Package vs. Namespace

`package` and `namespace` are unrelated keywords:

| Keyword | Meaning | Scope | Runtime effect |
|---------|---------|-------|----------------|
| `package` | Compile-time symbol grouping | A directory of `.twf` files | None — it only groups and qualifies names |
| `namespace` | Temporal deployment topology (unchanged) | A Temporal namespace instantiating workers/endpoints | Real — the existing Temporal deployment construct |

A `namespace` block is where you deploy; a `package` clause is how you name. A topology file is just a `package` that imports the domains it wires up.

---

## How Packages Appear Downstream

Packaged designs emit **package-qualified node identities** to the graph and visualizer: a workflow `Charge` in package `billing` has node identity `workflow:billing.Charge`, an operation is `nexusOperation:billing.Svc.Op`. The package rides **inside the name**, so it renders as part of the name, not as a new tier. Endpoints, workers, and namespaces keep bare identity, and the default (clause-less) package is elided so unpackaged designs are byte-identical to before. See the visualizer spec's [GRAPH_VIEW.md](../../../tools/visualizer/spec/GRAPH_VIEW.md) for the grouping lens.
