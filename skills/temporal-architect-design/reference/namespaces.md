# Namespaces: How Many?

> **Namespaces are organizational, not architectural** — an ownership/operational boundary, not a decomposition tool. The default is **one**; each additional namespace needs a reason from the ladder below.

## Decision Ladder

Add a namespace for:

- **A distinct owning team** — ownership, access control, on-call.
- **A different security / compliance context** — PCI vs non-PCI, org-level tenant isolation.
- **An independent deployment lifecycle** — release cadence, blast radius.
- **An external service contract across an org boundary** — the Nexus case ([nexus.md](../topics/nexus.md)).

Not for — use instead:

- Different worker / runtime (GPU, licensed software) → **task queues** ([task-queues.md](../topics/task-queues.md)).
- Agent or tool scoping → **worker registration**.
- Layer separation (inner vs outer logic) → **workflow boundaries** ([workflow-boundaries.md](./workflow-boundaries.md)).
- "One per worker" or "it feels cleaner" → nothing; co-locate.

## Worked Judgment: Two-Layer Agent System

An outer agent plans and calls an inner agent that executes tools; each has its own tools. The tempting start — a namespace for the planner and one per tool runner, 5–6 in all — is wrong: tool scoping is worker registration, and the layers are tightly coupled. The only real boundary is the service contract between the layers: if the inner agent is genuinely an independent service, that justifies **two** namespaces joined by **Nexus**, no more.

```twf
worker outerAgentWorker:
    workflow OuterAgent
    activity PlanSteps
    activity SummarizeOutcome

worker innerAgentWorker:
    workflow InnerAgent
    activity SearchTool
    activity CalcTool
    nexus service InnerAgentService

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

## Parameterized namespaces and endpoints

A `{param}` hole in a namespace or endpoint name (`namespace fabric-shard-{org}:`) declares a family, one member per tenant. Holes bind by spelling, so a mistyped `{param}` silently starts a new family ([#129](https://github.com/jmbarzee/temporal-architect/issues/129)). Grammar and resolution: `twf spec workers-and-namespaces`.

```twf
nexus service BootstrapService:
    async BootstrapShard workflow BootstrapShardWorkflow

workflow BootstrapShardWorkflow(shardId: string):
    activity InitShard(shardId)
    close complete

activity InitShard(shardId: string):
    init(shardId)

workflow CallerWorkflow(org: string):
    nexus fabric-shard-{org}-BootstrapShard BootstrapService.BootstrapShard(org)
    close complete

worker bootstrapWorker:
    workflow BootstrapShardWorkflow
    activity InitShard
    nexus service BootstrapService

worker callerWorker:
    workflow CallerWorkflow

namespace fabric-shard-{org}:
    worker bootstrapWorker
        options:
            task_queue: "q-{org}-bootstrap"
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q-{org}-bootstrap"

namespace app:
    worker callerWorker
        options:
            task_queue: "app"
```
