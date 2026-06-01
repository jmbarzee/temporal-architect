# Namespaces: How Many?

How many namespaces should a design use? This is a cross-cutting deployment decision — it interacts with workers, task queues, and Nexus — so it lives here as a boundary call alongside [workflow-boundaries.md](./workflow-boundaries.md), not as a construct deep-dive. The load-bearing rule:

> **Namespaces are organizational, not architectural.** They are an operational/ownership boundary, not a decomposition tool. The default is **one**; adding more requires justification.

Without this rule, designs drift toward "one namespace per layer → one per worker," which is almost always an overuse. Agent/tool scoping is solved by worker registration; runtime heterogeneity by task queues; layer separation by workflow boundaries. **None of those justify a namespace.**

---

## Decision Ladder

### Default: one namespace

Start here. A single namespace holds all your workers, workflows, and activities. Tightly-coupled workflows belong **together** — coupling is an argument for co-location, not separation.

### Add a namespace only when one of these demands it

| Reason | Why it's a namespace boundary |
|--------|-------------------------------|
| **Distinct team owns the workflows** | Separate ownership, access control, on-call |
| **Different security / compliance context** | PCI vs non-PCI, tenant isolation at the org level |
| **Independent deployment lifecycle** | Separate release cadence and blast radius |
| **External service contract across an org boundary** | The Nexus case — a typed contract between services |

### Explicitly NOT reasons to add a namespace

| Drift | What actually solves it |
|-------|-------------------------|
| Different worker / runtime (GPU, licensed software) | **Task queues** ([task-queues.md](../topics/task-queues.md)) |
| Agent or tool scoping | **Worker registration** (which types run together) |
| Layer separation (inner vs outer logic) | **Workflow boundaries** (child workflows / activities) |
| "One per worker" by default | Nothing — co-locate them |
| "It feels cleaner" | Nothing — resist it |

---

## Worked Judgment: Two-Layer Agent System

Consider an inner agent (executes tools) and an outer agent (plans, calls the inner agent), each with its own tools.

- **Tempting (wrong) start:** a namespace per worker — one for the planner, one for each tool runner — arriving at 5-6 namespaces.
- **Why it's wrong:** inner-agent vs outer-agent *tool scoping* is **worker registration** (register each agent's tools on its own worker), not a namespace boundary. The layers are tightly coupled, which argues for co-location.
- **The legitimate split:** the only real boundary is the **org/service contract** between the two layers — if the inner agent is genuinely an independent service with its own contract, that justifies **two** namespaces connected by **Nexus**. Not more.

The mechanism is **worker registration for scoping, namespaces only for the service boundary**:

```twf
# Tool scoping is worker registration, NOT a namespace:
worker outerAgentWorker:
    workflow OuterAgent
    activity PlanSteps
    activity SummarizeOutcome

worker innerAgentWorker:
    workflow InnerAgent
    activity SearchTool
    activity CalcTool
    nexus service InnerAgentService

# Exactly two namespaces: one per org/service-contract boundary.
namespace outerAgent:
    worker outerAgentWorker
        options:
            task_queue: "outer-agent"

namespace innerAgent:
    worker innerAgentWorker
        options:
            task_queue: "inner-agent"
    nexus endpoint InnerAgentEndpoint
        options:
            task_queue: "inner-agent"
```

The final two-namespaces-with-Nexus topology can be a fine outcome; the mistake is *starting* at one-per-worker and being talked back down. Start at one, and require a reason from the ladder above to add each additional namespace.

---

## Related

- [task-queues.md](../topics/task-queues.md) — different runtimes use task queues, not namespaces.
- [nexus.md](../topics/nexus.md) — the cross-namespace contract; the one mechanism that legitimately spans namespaces.
- [workflow-boundaries.md](./workflow-boundaries.md) — child workflow vs activity vs nexus.
