---
name: temporal-architect
description: Entry point for designing, building, adopting, or evolving Temporal systems — start here. Coordinates the temporal-architect skill set (design, per-SDK authoring, infrastructure): orients the design↔code direction, decomposes a `.twf` design into independently-implementable chunks at contract boundaries, and dispatches the right specialist skills. Use at the start of any Temporal architecture, workflow, worker, or Temporal-adoption task.
---

# Temporal Architect

This skill does not design or author; it routes to the specialists:

| Skill | Owns |
|-------|------|
| `temporal-architect-design` | The `.twf` design (workflows, activities, namespaces, Nexus), forward and recovered from code. Never SDK code. |
| `temporal-architect-author-infra` | Control-plane provisioning (namespaces, Nexus endpoints, search attributes). Orthogonal to language authoring. |
| `temporal-developer` | Temporal's official skill: SDK idioms, testing, determinism, errors, data, versioning. Each language author names the topics it hands there. |

Language authors, one per SDK, each built from [reference/author-template.md](reference/author-template.md):

| `@sdk` | Author |
|--------|--------|
| `go` | `temporal-architect-author-go` |

Its job is to protect the main agent's context: keep it on the architecture (workloads, scaling, reliability, availability) and dispatch code-scale authoring to subagents that each see only their chunk. The main agent is not always the design agent — sometimes it is authoring or reverse-engineering.

---

## Orient

The design↔code edge runs in two directions:

- **A — `.twf` → code** (forward). The steady state: once a `.twf` exists, change the `.twf` first, then propagate forward to the authors.
- **B — code → `.twf`** (recovery). Bootstraps a `.twf` from an existing app or reconciles drift. Owned end to end by the design skill, including splitting a large repo into slices.

Detect the situation from the repo (no subagent needed):

| Situation | Signal | Path |
|-----------|--------|------|
| **Greenfield** | No `.twf`, no Temporal SDK usage | Design (A) → author forward |
| **Existing app, no `.twf`** (the common adoption path) | Temporal SDK imports / worker code, no `.twf` | Recover `.twf` (B) → then forward |
| **`.twf` exists — implement / evolve** | `.twf` present | Edit the `.twf` first → propagate forward (A) |
| **Drift** | Code and `.twf` disagree | Reconcile into the `.twf` (B) → then forward (A) |

There is no drift detector yet; the signals are the authors' build/test against the linked implementation and the sampler's observed graph in production. Route every drift fix **through the `.twf`** — never patch code and leave the `.twf` stale.

---

## Decompose and dispatch

Once a `.twf` exists, run **`twf graph chunks`** and cut at **contract boundaries, never finer**. The tool informs; you decide:

- **Hard boundaries** (isolated components, `nexusCall` cuts) — MUST go to separate author subagents.
- **Soft divisions** (only over a ceiling you set) — MAY be used; their dependency DAG is the build order.

Before dispatching a non-trivial design, read [reference/decomposition.md](reference/decomposition.md): thresholds, build order, which chunks to skip, where to pin contracts, and the manual fallback.

---

## Route

Load the minimum that fits. **Default:** `temporal-architect-design` + the **one** author for the chunk's SDK, plus `temporal-architect-author-infra` if the topology needs control-plane resources. Load a skill, not its internals.

- **Skip design** for a pure implementation of a settled `.twf` — load only the author(s).
- **Design in the main agent** when the work is design-heavy or collaborative: the user usually wants to be in the design loop. Dispatch authoring to subagents.
- **An SDK boundary wants both authors.** Pin the boundary contract once, then prefer isolated per-SDK author subagents that exchange only that contract — two SDK vocabularies in one context are confusable. Co-loading is acceptable when the boundary is small. Read [cross-sdk.md, only when a call or return crosses workers whose `@sdk` differ](reference/cross-sdk.md).

A chunk's SDK is each `@sdk` on the workers registering it, and each SDK goes to its own author; with none, infer it from project layout or ask the user. An SDK with no author row is an open question for the user, not a guess.
