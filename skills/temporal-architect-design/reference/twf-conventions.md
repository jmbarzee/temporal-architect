# `.twf` Conventions

How to lay out `.twf` files and the small set of comment conventions that carry information the grammar doesn't yet express.

## One package for all `.twf`

**Recommendation: keep all of a project's `.twf` in one package** (one directory whose files resolve together). Cross-file references — an `activity` defined in one file and called in another, a `nexus service` provided in one file and called in another — resolve only within a shared file set. One package means every reference resolves and `twf check` sees the whole design at once.

This decouples `.twf` layout from code layout: the files no longer mirror the directory structure of the implementation. That trade-off is worth it — resolution coverage matters more than co-location — and the [impl-link header](#impl-link-header) below restores the link to the code.

## Comment conventions

`.twf` comments (`#`) are free text to the parser, but a small **named set** carries conventional meaning the tooling and the reader rely on. Use these exact forms.

### Impl-link header

A top-of-file comment linking a `.twf` to the implementation directory (or directories) it describes:

```twf
# impl: order-service/workflows, order-service/activities
workflow ProcessOrder(order: Order) -> (Result):
    activity ChargePayment(order) -> receipt
    close complete(Result{receipt})

activity ChargePayment(order: Order) -> (Receipt):
    charge(order.payment)
```

Because the one-package layout decouples `.twf` from code, the implementation link can no longer be inferred from location — it has to be explicit. The header is that link. It is also a [reverse-engineering](./reverse-engineering.md) aid: the [project-discovery subagent](./project-discovery-subagent.md) *reads* it to jump straight to the code, and extraction *writes* it when recovering a `.twf` from existing code.

This is the interim form. The durable, machine-checkable version is per-symbol reference annotations (`@ref`), deferred in `dsl/BACKLOG.md` — when that lands, the header convention gives way to it.

### Cross-domain stub marker

A marker on a local stub definition that exists only to satisfy resolution for a symbol actually defined in another `.twf`:

```twf
# cross-domain stub — defined in payments.twf
nexus service PaymentService:
    sync ChargeCard(req: ChargeRequest) -> (Receipt)
```

Defining *one* local `nexus service` turns every other service reference in the file into a hard error — including genuinely external services in other namespaces (see [common-errors.md](./common-errors.md#nexus-resolution-external-warning-vs-local-error)). The stub marker documents that the definition is a local placeholder, not the real owner, so a partial / per-domain file can both call and provide services without tripping the resolution cliff. The marker makes the stub's intent obvious to readers and to the discovery subagent.
