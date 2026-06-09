# Project-Discovery Subagent

A single reusable primitive: **scan an existing repo on a bounded slice, return a compact summary.** Owned here (design-skill) and shared by every skill that has to understand a repo it didn't write:

- **design reverse-engineering** — [reverse-engineering.md](./reverse-engineering.md) B1a bootstrap (no `.twf`) and B1b drift-check.
- **author-go existing-repo Orient** — `temporal-architect-author-go/SKILL.md` (see `author-go-skill/REVISIONS_001` Group 1).
- **author-infra** — repo/tooling discovery when that skill lands.

Design once, reuse. This spec is the broadened, shared form of the `sdk-explorer` agent sketched in [SUBAGENT_ADOPTION.md](../../temporal-architect-author-go/SUBAGENT_ADOPTION.md) — it answers that doc's open question ("should it also scan the user's existing project code for conventions?") with **yes**: project-convention discovery is this subagent's job, not the orchestrator's.

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
- **`.twf` / `.tf` presence** — existing design files and Terraform/infra files for this slice.
- **Comment conventions** — impl-link headers and cross-domain stub markers (see [twf-conventions.md](./twf-conventions.md)); these point discovery straight at the implementation.

## Output

A **compact structured summary** — conclusions, not raw dumps. Never paste whole files back. Cover:

- Tooling: hand-written vs generated; generator stack if any.
- Layout: where the relevant code lives for the scanned slice.
- SDK usage: workflows/activities/nexus found, with their call sites.
- Registration: how workers register the discovered types.
- Existing `.twf`: present/absent, and what it covers.
- Impl-links: any comment conventions found, and what they point to.
- Open questions the caller must resolve.

## Agent definition

Copy-pastable subagent prompt (frontmatter style matches `sdk-explorer` in [SUBAGENT_ADOPTION.md](../../temporal-architect-author-go/SUBAGENT_ADOPTION.md)):

```yaml
---
name: project-discovery
description: Scan an existing repo on a bounded slice for tooling, layout, conventions, and Temporal usage. Returns a compact summary.
tools: Read, Glob, Grep, Bash, WebFetch, WebSearch
model: sonnet
---
```

```
You are scanning an existing repository on a BOUNDED SLICE. Do not scan the whole
repo — stay within the slice the caller named.

Inputs:
- Repo root: <path>
- Slice: <paths / domain / entry points>
- Focus: <what the caller needs>

Scan for: build/codegen tooling (Makefile, buf.gen.yaml, //go:generate), package
layout, Temporal SDK usage (workflow/activity/nexus call sites, handlers),
registration style (worker.New + Register*, generated helpers, fx wiring), .twf/.tf
presence, and impl-link / cross-domain-stub comment conventions.

Return a COMPACT STRUCTURED SUMMARY — conclusions only, never raw file dumps:
tooling, layout, SDK usage, registration, existing .twf, impl-links, open questions.

For SDK-symbol meaning, delegate to the relevant author skill's reference (e.g.
author-go references read backward) rather than reconstructing it yourself.
```
