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

## Naming: the `deploy_name` form

A namespace name is not a plain identifier — it is a **`deploy_name`**:

```
(letter | '_') [a-zA-Z0-9_-]* ( '{' IDENT '}' [a-zA-Z0-9_-]* )*
```

- **Hyphens are allowed** (`fabric-shard`), and so are `{param}` **template holes** (`fabric-shard-{org}`).
- **No leading hyphen** — the name must start with a letter or `_`.
- **No dots** — a dot terminates the name, and the leftover is a parse error (`parse/SYNTAX`, `definition requires ':' and an indented body`).

Exactly **three** name positions take this `deploy_name` form: the **namespace name**, the **nexus endpoint name** (`nexus endpoint fabric-shard-{org}-BootstrapShard`), and the **nexus endpoint reference** in a call (`nexus fabric-shard-{org}-BootstrapShard Svc.Op(...)`, plus its `promise` / `await` / `detach nexus` / `await one` forms). Every *other* identifier — workflow, activity, worker, package, service, and operation names — stays a plain identifier, unchanged. A static, hyphen-free name is itself a valid `deploy_name` (a subset of `IDENT`), so all existing designs are unaffected.

The `{param}` holes make a namespace/endpoint **parameterized** — see [Parameterized namespaces and endpoints](#parameterized-namespaces-and-endpoints) below.

## Parameterized namespaces and endpoints

A per-tenant / per-org / per-shard deployment often wants **one family** of namespaces and endpoints, one member per tenant, rather than a hand-written namespace apiece. A `{param}` hole in a `deploy_name` expresses exactly that: `namespace fabric-shard-{org}:` is a **family**, and each concrete `org` is a member.

### Identity is the full templated name string

A parameterized family's identity is its **whole assembled name string, with holes matched by spelling (token equality)**. A definition and a reference bind **iff their assembled strings are identical**:

- `fabric-shard-{org}-BootstrapShard` (definition) binds `fabric-shard-{org}-BootstrapShard` (reference).
- A spelling mismatch, or a **static** reference to a templated endpoint, does **not** bind — it falls through to the existing undefined-endpoint hard error `NEXUS_UNDEFINED_ENDPOINT`.

There is **no first-class family declaration** (deferred — [#129](https://github.com/jmbarzee/temporal-architect/issues/129)). Membership is implicit in the matching name strings, so a **mistyped param spawns a silent new family** rather than an error. That is the guardrail's edge: watch your spelling.

Endpoints stay **flat-global and are never package-qualified** — parameterization does not change that. A family's **cardinality** is the set of distinct `{tokens}` in first-appearance order (the same set the wire surfaces as `templateParams` and the visualizer renders as a `× org` cardinality badge).

### Worked example

`fabric-shard-{org}` namespace with a matching endpoint and a templated `task_queue`, plus a caller in a static namespace that references the endpoint by the identical string. This snippet passes `twf check`:

```twf
nexus service BootstrapService:
    async BootstrapShard workflow BootstrapShardWorkflow

workflow BootstrapShardWorkflow(shardId: string):
    activity InitShard(shardId)
    close complete

activity InitShard(shardId: string):
    init(shardId)

workflow CallerWorkflow(org: string):
    # References the templated endpoint by the *identical* string — binds by full-string identity.
    nexus fabric-shard-{org}-BootstrapShard BootstrapService.BootstrapShard(org)
    close complete

worker bootstrapWorker:
    workflow BootstrapShardWorkflow
    activity InitShard
    nexus service BootstrapService

worker callerWorker:
    workflow CallerWorkflow

# Parameterized family: one namespace + endpoint per org.
namespace fabric-shard-{org}:
    worker bootstrapWorker
        options:
            task_queue: "q-{org}-bootstrap"   # {org} is a deploy-time template hole, bound by the namespace
    # The endpoint's {param} set must be a superset of the namespace's (here both are {org}).
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q-{org}-bootstrap"

namespace app:
    worker callerWorker
        options:
            task_queue: "app"
```

The `{org}` in `task_queue: "q-{org}-bootstrap"` is a **deploy-time template hole**, not runtime interpolation — see [template holes vs. runtime interpolation](../topics/task-queues.md#template-holes-vs-runtime-interpolation). Two resolver errors guard family well-formedness (`ENDPOINT_PARAM_NOT_SUPERSET`, `UNBOUND_TEMPLATE_PARAM`) — see [common-errors.md](./common-errors.md#resolve-errors-kind-resolve).

## Related

- [nexus.md](../topics/nexus.md) — templated endpoint *references* bind by full-string identity; endpoints stay flat-global.
- [task-queues.md](../topics/task-queues.md) — different runtimes use task queues, not namespaces.
- [nexus.md](../topics/nexus.md) — the cross-namespace contract; the one mechanism that legitimately spans namespaces.
- [workflow-boundaries.md](./workflow-boundaries.md) — child workflow vs activity vs nexus.
