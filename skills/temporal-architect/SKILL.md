---
name: temporal-architect
description: Entry point for designing, building, adopting, or evolving Temporal systems — start here. Coordinates the temporal-architect skill set (design, Go authoring, infrastructure): orients the design↔code direction, decomposes a `.twf` design into independently-implementable chunks at contract boundaries, and dispatches the right specialist skills. Use at the start of any Temporal architecture, workflow, worker, or Temporal-adoption task.
---

# Temporal Architect

The front door to the `temporal-architect` skill set. This skill does not design or author directly — it **orients** the work, **decomposes** it at contract boundaries, and **routes** to the specialists:

| Skill | Owns |
|-------|------|
| `temporal-architect-design` | The `.twf` design (workflows, activities, namespaces, Nexus). Produces/reviews `.twf`; never SDK code. |
| `temporal-architect-author-go` | Go SDK implementation of a `.twf`. |
| `temporal-architect-author-infra` | Control-plane provisioning (namespaces, Nexus endpoints, search attributes). Orthogonal to language authoring. |

---

## North Star

`.twf` exists to **extend the complexity horizon of AI execution** — to let AI work at *system* scale, not code scale. (You don't cross a country on square-mile maps.) The largest gains in AI-assisted development came from wiring AIs into **deterministic tooling** — compilers, linters, testers. `temporal-architect` is that deterministic harness for **Temporal architecture**: it keeps the AI out of the weeds — error handling, library choices, application-code pedantics — so it can focus on the large scale: **workloads, scaling, reliability, availability**.

The product is a **context-protecting harness for the main agent**: fit a bigger problem into the same context window. Decompose at `.twf` contract boundaries, dispatch the heavy authoring to subagents that each see only their chunk, and keep the main context on the architecture. (The "main agent" is not always the *design* agent — sometimes it is authoring or reverse-engineering. Don't assume.)

Everything below serves that: protect context, raise the level of abstraction, and resist being dragged back down into code-scale busywork.

---

## Orient — which direction, which situation

The design↔code edge is traversed in **two directions**. Identify which one the task needs before doing anything else.

- **Direction A — `.twf` → application code** (forward authoring). The steady-state ideal: once a project has a `.twf`, *changes are made in the `.twf` first, then propagated forward* to the authors. Most work lives here.
- **Direction B — application code → `.twf`** (recovery / reconciliation). Bootstraps a `.twf` from an existing app, and reconciles drift back into the `.twf`.

Detect the **situation** cheaply (no subagent needed) and enter the matching path:

| Situation | Cheap signal | Path |
|-----------|--------------|------|
| **Greenfield** | No `.twf`, no Temporal SDK usage in the repo | Design (A) → author forward |
| **Existing app, no `.twf`** (dominant adoption path) | Temporal SDK imports / worker code, but no `.twf` | Recover `.twf` (B, design's reverse path) → then forward |
| **`.twf` exists — implement / evolve** | `.twf` present | Edit the `.twf` first → propagate forward (A) |
| **Drift** | Code and `.twf` disagree | Reconcile into the `.twf` (B) → then forward (A) |

**On drift:** the steady state keeps the `.twf` authoritative, so drift should be rare — but the *hard problem is catching it*. There is no first-class detector yet. Lean on the feedback surfaces that exist: the author skills' build/test verify against the linked implementation, and (for production divergence) sampler-driven `twf graph --history` checks. When drift is found, route the fix **through the `.twf`** (B), then re-author forward — never patch the code and leave the `.twf` stale.

Always check for prior artifacts first (existing `.twf`, `DESIGN.md`); the design skill's Orient covers this in depth. The detection-signal style here mirrors `temporal-architect-author-infra`'s Orient.

---

## Decompose — `twf graph chunks`

Once a `.twf` exists (or has been recovered), decompose it into independently-implementable units before dispatching. The unit of decomposition is a **contract boundary** — `.twf` *is* the contract — **never finer**.

Use **`twf graph chunks`**, which computes the decomposition from the design. **The tool informs; it does not impose** — you decide how to act on it. Its output has two cleanly-typed parts:

- **#1 hard boundaries — you MUST dispatch separate subagents across these.** Discovered facts: isolated components today (a `nexusCall` is the cleanest contract cut, cross-namespace by construction), language boundaries later. Every definition lands in exactly one hard chunk.
- **#2 soft divisions — you MAY use these.** Only emitted for a chunk that exceeds a complexity **`--ceiling N`** you instruct: ranked candidate cuts plus an inter-section **dependency DAG**.

Other knobs: a **floor** flags chunks too granular for their own subagent (merge them up); loops are collapsed into one chunk and never cut; roots are heuristic.

**Fallback (pre-tool):** if `twf graph chunks` is unavailable, enumerate chunks by hand from `twf symbols` / the `.twf` — heuristic roots (handler-bearing and Nexus-op-backing workflows, plus any with no inbound call edge) and their reachable children form connected components. Same dispatch logic, coarser input.

The detailed protocol for reading the tool's output — hard/soft handling, floor/ceiling, the dependency DAG, selective dispatch against existing code, and contract pinning — is in [reference/decomposition.md](reference/decomposition.md). Read it before dispatching a non-trivial design.

---

## Dispatch — progressive, not a waterfall freeze

Dispatch authoring **progressively**, in the dependency-DAG order the decomposition gives you:

- **Don't freeze every signature up front.** A global type freeze recreates waterfall's failure modes. Pin contracts rigidly **only** at the hard-boundary / cross-language cuts the decomposition surfaces (these are exactly the expensive-to-renegotiate interfaces). Everywhere else, start from a **loose API suggestion** and let constraints discovered during authoring feed back and refine it.
- **Don't parallelize everything.** Build independent chunks first, then the now-unblocked dependents — a PERT walk over the dependency DAG, not a blind fan-out.
- **Only dispatch what needs altering.** The decomposition is over the *design*; the tool doesn't know what's already implemented. For each chunk, resolve its code via the `# impl: <dirs>` link (see the design skill's `twf-conventions.md`) and **skip chunks that are new-free and unchanged** — never spin up an author for a component that doesn't need it. Use the relevant author skill's fast verify (e.g. `author-go`'s `go build`/`go test` on the linked package) as the cheap changed-vs-unchanged signal. A first-class chunk↔impl staleness check does not exist yet.

---

## Route — which skills to load

Routing is **advice with a sensible default, not a rigid rule**. Load the minimum that fits the work.

**Default:** `temporal-architect-design` + the **one** author for the chunk's language, plus `temporal-architect-author-infra` if the topology needs control-plane resources (it is orthogonal to language authoring).

Named exceptions:

- **Skip design** when there is no design change — a pure implementation of a settled `.twf`. Load only the author(s).
- **Design in the main agent.** Because the whole point is an elevated surface to design *from*, the user often wants to be integrated in the design loop. For design-heavy or collaborative work, load `temporal-architect-design` **into the main agent** rather than dispatching it to a subagent. Dispatch authoring to subagents to protect context.
- **A language boundary wants both authors.** A workflow in one language calling an activity in another is a genuine (not rare) case. Pin the boundary contract once, then prefer **isolated per-language author subagents that exchange only that contract** — this keeps two SDK-language authors out of a single context, where their overlapping vocabulary is *confusable*. Co-loading both is acceptable when the boundary is small and the isolation overhead isn't worth it; the confusability concern is the reason to default to separating them, not a hard prohibition.

`@lang` annotations (coming to the spec) will become the explicit dispatch key per chunk — don't over-engineer language routing before then; the heuristic + boundary handling above is enough.

---

## Reference Index

| Topic | When to consult | File |
|-------|-----------------|------|
| Decomposition + dispatch protocol | Reading `twf graph chunks` output; planning subagent breakout | [decomposition.md](reference/decomposition.md) |

The specialist skills carry their own references for design, Go authoring, and infrastructure — load the skill, not its internals, from here.
