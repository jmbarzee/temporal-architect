---
description: "Design, visualize, and implement entire Temporal systems — namespaces, workers, workflows, and Nexus — as a validated, visual source of truth."
---
**Design, visualize, and implement entire Temporal systems — namespaces, workers, workflows, and Nexus — as a validated, visual source of truth.**

Write your architecture in `.twf` and a real parser, language server, and visualizer give you (and your AI agent) compiler-grade feedback on the *whole system* before you write a line of SDK code — then generate the workers and provision the infra from the same design.

![Graph View — the whole system as a force-directed graph of namespaces, workers, and workflows with dependency edges](images/graph-view-system.png)

- **Catch design errors before code.** A real parser and language server validate the whole system — undefined activities, broken Nexus routing, misplaced determinism — while it's still a design, not a production incident.
- **See the whole deployment.** An interactive graph of namespaces → workers → workflows, plus a tree view that expands calls inline. Architecture you can actually look at.
- **One parseable source of truth.** `.twf` is a file every teammate and every tool reads and validates — not architecture prose buried in a prompt.
- **Design → running system.** Generate Temporal Go SDK code and provision control-plane infra from the same `.twf` — or recover a deployment graph straight from production history with the sampler.

```twf
activity ReserveFunds(amount: Money) -> (Hold):
    reserve(amount)

activity CaptureFunds(hold: Hold) -> (Receipt):
    capture(hold)

workflow ChargeOrder(order: Order) -> (Receipt):
    signal Cancel():
        close fail("cancelled")

    activity ReserveFunds(order.amount) -> hold
        options:
            start_to_close_timeout: 30s
    activity CaptureFunds(hold) -> receipt
    close complete(receipt)

worker billing:
    workflow ChargeOrder
    activity ReserveFunds
    activity CaptureFunds

namespace payments:
    worker billing
        options:
            task_queue: "billing"
```

Workflow logic, the worker that hosts it, and the namespace topology — one readable file.
