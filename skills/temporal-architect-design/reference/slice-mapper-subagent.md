# Slice-Mapper Subagent

A single reusable primitive: **scan an existing repo at the whole-repo level and *propose* how to carve it into recoverable slices.** It is the reverse-path analog of `twf graph chunks` — the decomposition step the adoption path never had.

Where [project-discovery](./project-discovery-subagent.md) is the **worker** (scan one bounded slice, deeply), slice-mapper is the **decomposer** (scan the whole repo, cheaply, to find the slices). They are siblings, single-purpose each, and the split keeps the forward and reverse paths symmetric:

| Forward (exists) | Reverse (this primitive) |
|---|---|
| `twf graph chunks` → `Chunk` / `ChunkEdge` DAG | `slice-mapper` → slice map + cross-slice edge list |
| per-chunk author subagent | per-slice `project-discovery` (run N times) |

slice-mapper **proposes a map; it recovers nothing.** Deep per-slice semantics — SDK usage, registration wiring, extraction into `.twf` — stay `project-discovery`'s job. This is the one primitive allowed a repo-level view; `project-discovery`'s "no whole-repo scans" contract is deliberately *not* loosened, because repo-level scanning is exactly what this sibling exists to own.

## Why a subagent

Same context-protection move as project-discovery. Deciding how a large repo divides means reading its whole package tree and registration wiring — a lot of tokens, almost none of which belong in the design conversation, only the resulting map. Running the scan in an **isolated subagent that returns a compact map** keeps the orchestrator focused on confirming boundaries, not on absorbing the repo.

## Trigger discipline

Dispatch slice-mapper **only when the adoption target is larger than one bounded slice** — a whole service, a multi-domain monorepo, a repo whose boundaries the adopter cannot yet name. For a single already-identified slice, skip it and dispatch `project-discovery` directly.

The map is **advisory: it informs, it does not impose** (the same contract as the forward `twf graph chunks` output). The orchestrator confirms and narrows the proposed slice map **with the user** before any per-slice fan-out. A map acted on without confirmation is the failure mode — it hard-codes boundaries the human never agreed to.

## Inputs

| Input | Description |
|-------|-------------|
| Repo root | Absolute path to the project. |
| Focus / domains of interest | Optional. Narrows the proposal toward the domains the adopter cares about; absent, the mapper proposes over the whole repo. |

## What it scans

**Cheap and structural only** — the mapper reads the *shape* of the repo, never its per-slice semantics:

- **Proto / package tree** — `proto/` package layout, directory structure, module boundaries. The coarse partition candidates.
- **Registration wiring** — `worker.New` + `Register*` call sites, generated `RegisterXxxActivities/Workflows` helpers, `fx` (or other DI) wiring. Which workers own which types — the seams between slices.
- **Cross-package / cross-slice call sites** — Nexus operation calls, cross-package `ExecuteChildWorkflow`, imports that cross a candidate boundary. These become the *edges* between slices.

It explicitly does **not** read for deep semantics — signal/query/update handler bodies, activity implementations, timeout/retry tuning, the DSL↔SDK mapping. That is `project-discovery`'s job, run per confirmed slice.

## Output

A **compact, advisory map** — conclusions, not raw dumps. Never paste whole files or whole trees back. Two structured parts plus an ordering:

- **Slice map** — a list of candidate domains, each with:
  - `id` — a short domain name.
  - `paths / packages` — the directories / proto packages that belong to it.
  - `entry points` — the client-started / schedule-started / Nexus-op-backing / handler-bearing workflows that root it.
- **Cross-slice edge list** — one entry per dependency between slices: `from` → `to`, plus `via` = the **contract artifact** that carries the dependency (a proto package, a Nexus operation, a shared worker/task queue). This is the reverse-path analog of `ChunkEdge`.
- **Suggested recovery order** — a recommended sequence, **contract producers before consumers** (see [reverse-engineering.md](./reverse-engineering.md)), derived from the edge list. Advisory — the orchestrator confirms it with the user.

Plus any **open questions** the caller must resolve (ambiguous boundaries, a package that could belong to two slices).

## Discipline

- **Informs, does not impose.** The map is a proposal. The orchestrator confirms/narrows it with the user before fan-out.
- **Decompose, don't recover.** Stop at the map. Do not extract `.twf`, do not read handler bodies — hand each confirmed slice to `project-discovery`.
- **Cheap and structural.** Package tree, registration wiring, cross-package call sites. If you find yourself reading an activity body, you have left your scope.
- **Compact conclusions.** Return the map and edges, not the files you read.

## Agent definition

Copy-pastable subagent prompt:

```yaml
---
name: slice-mapper
description: Scan a whole repo cheaply and structurally to PROPOSE a slice map + cross-slice edge list for reverse decomposition. Recovers nothing; hands slices to project-discovery.
tools: Read, Glob, Grep, Bash, WebFetch, WebSearch
model: sonnet
---
```

```
You are DECOMPOSING an existing repository for reverse engineering. You PROPOSE how
to carve the repo into recoverable slices — you recover NOTHING. Deep per-slice work
belongs to the project-discovery subagent, dispatched later per confirmed slice.

Inputs:
- Repo root: <path>
- Focus / domains of interest: <optional; else propose over the whole repo>

Scan CHEAPLY and STRUCTURALLY only — never read per-slice semantics:
- proto / package tree (directory + proto package layout) → candidate slices
- registration wiring (worker.New + Register*, generated RegisterXxx helpers, fx/DI)
  → which worker owns which types, i.e. the seams
- cross-package / cross-slice call sites (Nexus ops, cross-package ExecuteChildWorkflow,
  boundary-crossing imports) → the edges between slices

Do NOT read handler bodies, activity implementations, or the DSL↔SDK mapping — that is
project-discovery's job.

Return a COMPACT ADVISORY MAP — conclusions only, never raw file/tree dumps:
- Slice map: for each candidate domain, { id, paths/packages, entry points }
- Cross-slice edge list: from → to, via = the contract artifact (proto package /
  Nexus op / shared worker)
- Suggested recovery order: contract producers before consumers, derived from the edges
- Open questions the caller must resolve

The map INFORMS; it does not impose. The orchestrator confirms and narrows it with the
user before any per-slice fan-out.
```
