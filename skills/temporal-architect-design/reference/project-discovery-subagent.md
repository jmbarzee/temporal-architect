# Project-Discovery Subagent

A single reusable primitive: **scan an existing repo on a bounded slice, return a compact summary.** Owned here (design-skill) and shared by every skill that has to understand a repo it didn't write:

- **design reverse-engineering** — [reverse-engineering.md](./reverse-engineering.md) B1a bootstrap (no `.twf`) and B1b drift-check.
- **author-go existing-repo Orient** — `temporal-architect-author-go/SKILL.md`.
- **author-infra** — repo/tooling discovery.

Design once, reuse. This spec is the broadened, shared form of an `sdk-explorer`-style agent, and it settles where project-convention discovery belongs: **this subagent scans the user's existing project for conventions**, not the orchestrator.

## Why a subagent

Discovery is context-heavy and disposable. Reading a repo's tooling, layout, and registration wiring burns tokens the design conversation needs — and almost none of what it reads belongs in the main context, only the conclusions. Running discovery in an **isolated subagent that returns a summary** is the context-protection move: the orchestrator stays focused on design, the subagent absorbs the noise.

## Trigger discipline

Dispatch **deliberately, on a bounded slice** — never reflexively, never "scan the whole repo." The caller names the slice (a domain, a directory, a set of entry points). An unbounded scan defeats the purpose: it floods the subagent's own context and returns a summary too broad to act on. If the slice is unclear, the orchestrator narrows it *with the user* before dispatching.

## Inputs

| Input | Description |
|-------|-------------|
| Repo root | Absolute path to the project. |
| Bounded slice | The paths / domain / entry points to scan. Required — no whole-repo scans. |
| Focus | What the caller needs (e.g. "Temporal registration style", "codegen tooling", "existing `.twf` for this domain"). |

## What it scans

- **Build / codegen tooling** — `Makefile`, `buf.yaml` / `buf.gen.yaml`, `//go:generate` directives, `protoc` plugins. Identifies whether code is hand-written or generated, and by what.
- **Package layout** — directory structure, where workflows/activities live, `proto/` → `gen/` → `lib/` style splits.
- **Temporal SDK usage** — `go.temporal.io/sdk` imports, `workflow.ExecuteActivity` / `ExecuteChildWorkflow` / Nexus call sites, signal/query/update handlers.
- **Registration style** — `worker.New` + `RegisterWorkflow`/`RegisterActivity`, generated `RegisterXxxActivities/Workflows` helpers, DI wiring (`fx`), struct-vs-func activities.
- **Shared-worker topology** — from that same registration wiring, capture per slice which shared worker process / task queue each domain's types register on: the **shared worker → task queue → registered types** mapping. This is the raw material the stitch step turns into the topology-owner package's qualified registrations (see [reverse-engineering.md](./reverse-engineering.md#deployment-topology-during-recovery)). Record the mapping, not the wiring code.
- **`.twf` / `.tf` presence** — existing design files and Terraform/infra files for this slice.
- **`.twf` package layout** — `package` clauses and `import` declarations (see [twf-conventions.md](./twf-conventions.md)); which directory owns which domain, and how packages reference each other.
- **Comment conventions** — impl-link headers (see [twf-conventions.md](./twf-conventions.md)); these point discovery straight at the implementation.

## Output

A **compact structured summary** — conclusions, not raw dumps. Never paste whole files back. Cover:

- Tooling: hand-written vs generated; generator stack if any.
- Layout: where the relevant code lives for the scanned slice.
- SDK usage: workflows/activities/nexus found, with their call sites.
- Registration: how workers register the discovered types.
- Shared-worker topology: the per-slice **shared worker → task queue → registered types** mapping, as a summary the stitch step can act on — not a wiring dump.
- Existing `.twf`: present/absent, and what it covers.
- Impl-links: any comment conventions found, and what they point to.
- Open questions the caller must resolve.

## Agent definition

The deployable definition (frontmatter + prompt body) lives at
[`../subagents/project-discovery.md`](../subagents/project-discovery.md); edit it there —
it is the single source a builder consumes. This doc is the rationale.
