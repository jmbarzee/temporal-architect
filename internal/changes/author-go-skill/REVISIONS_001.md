# Author-Go Skill Revisions

**Source:** skill-retro planning session
(`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 1).
**Reflection:** `lessons_from_skills_on_existing_project.md` (reverse-engineering 10 Go proto-first domains).

## Summary

`author-go` assumes a greenfield, hand-written project — unlikely in reality, where adoption into an
existing repo (often proto-driven codegen) is the dominant case. This cycle adds an Orient step that
resolves two independent axes (greenfield-vs-existing; codegen-variant), routes proto-first specifics
to a non-polluting reference, promotes three-layer testing to a recommended practice, and expands the
worker section with Go-specific wiring. No DSL/tooling changes — all author against today's grammar.

**Source material to distill (then delete):**
`internal/changes/temp-change-set/skill-retro/PROTO_DRIVEN_TEMPORAL.md` and `…/THREE_LAYER_TESTING.md`
are the raw input for Groups 2–3. Distill the key parts into the new references, then remove the root
docs — they are input, not shipped content. Generator stack: `cludden/protoc-gen-go-temporal`
(`protoc-gen-go_temporal`) + `alta/protopatch` + `buf`; optional Nexus via
`bergundy/protoc-gen-go-nexus[-temporal]`; mocks via `vektra/mockery`.

## Group 1: Existing-repo Orient + codegen-variant routing (A0)

**Findings:**
- The main flow assumes greenfield. Add an **Orient step** (symmetric to design's Orient) resolving:
  **Axis 1** greenfield-vs-existing — *detect* for existing repos, *ask* for greenfield; **Axis 2**
  codegen variant (proto-first vs hand-written) — *detect from repo* for existing (treat conventions
  as requirements to match), *ask* for greenfield. Greenfield default = hand-written.
- **Routing design (context protection):** the main `SKILL.md` body holds only the cheap layer —
  Orient + detection signals (`buf.gen.yaml`→`protoc-gen-go_temporal`, generated `*_temporal.pb.go`,
  `(temporal.v1.activity|workflow)` annotations) + a small routing table (`variant → reference file`).
  Heavy variant payload lives in a Level-3 reference loaded only when its signal fires. Extensible:
  new variant = 1 reference + 1 routing row.

**Files touched:** `skills/temporal-architect-author-go/SKILL.md`
**Change type:** `Internal`
**Parallelism:** Depends on the shared project-discovery subagent (owned by `design-skill/REVISIONS_002`
Group 2 — B1c) for the "detect existing repo" scan; Groups 2–4 here are independent of each other.

**Specific changes:**
1. Add an Orient section to `SKILL.md` with the two-axis decision (detect-existing / ask-greenfield).
2. Add the detection-signal list + a `variant → reference` routing table to the body.
3. Dispatch the shared project-discovery subagent for the existing-repo scan (bounded slice; deliberate trigger).

## Group 2: `references/proto-driven.md` (A1, A2)

**Findings:**
- Proto-first is a real, common existing-repo pattern with no current author-go coverage. Capture it
  as the first codegen-variant reference. Filename **`proto-driven.md`** (descriptive); keep "PFI" as a
  documented alias. Route on concrete repo signals, never the acronym.

**Files touched:** `skills/temporal-architect-author-go/references/proto-driven.md` (new); routing row in `SKILL.md`.
**Change type:** `Internal`
**Parallelism:** Independent.

**Specific changes (key parts only — get a dev running):**
1. Contract + layout: `proto/` (source of truth) → `gen/` (generated, never edit) → `lib/` (hand-written).
2. Tools + `go install` from go.mod; `buf.yaml` / `buf.gen.yaml` skeletons; `buf generate`.
3. Proto annotations (`(temporal.v1.service|activity|workflow)`, `(go.field).tags`); `XxxInput/XxxOutput`.
4. **Generated-symbol table (the Rosetta Stone, dual-purpose with design reverse):** `XxxActivities`
   iface, `RegisterXxxActivities`, `XxxActivityName`, `XxxFuture`, `XxxWorkflows`, `RegisterXxxWorkflows`,
   `XxxClient`.
5. Implement (validate→call→return), register at worker startup (fx), hand-written client interface.

## Group 3: `references/three-layer-testing.md` + testing as a recommended practice (A3)

**Findings:**
- Three-layer testing is excellent practice for *any* clean Go Temporal project (not proto-specific).
  Promote it: recommend it in the main flow (with the *why*), mechanics in the reference. Generated
  mocks (`mockery`) are an **option within** testing — the one proto seam — not a requirement.

**Files touched:** `skills/temporal-architect-author-go/references/three-layer-testing.md` (new); a
recommended-testing step in `SKILL.md`.
**Change type:** `Internal`
**Parallelism:** Independent.

**Specific changes:**
1. Three layers, each mocks only its direct dependency: Workflows (mock activities iface, `WorkflowTestSuite`),
   Activities (mock client iface), Clients (real, `//go:build integration` + testcontainers).
2. Patterns: conditional mocks mirror validation flow; fresh env per table case; split constructor/validation
   tests from execution tests.
3. Proto seam: "if proto-driven, the activities interface is generated — mock it with `mockery`."

## Group 4: Worker section expansion (A4)

**Findings:**
- Existing `reference/worker.md` is solid on basics. Expand with Go-specific, durable wiring that is
  **not** downstream of the eventual DSL worker-options feature.

**Files touched:** `skills/temporal-architect-author-go/reference/worker.md`
**Change type:** `Internal`
**Parallelism:** Independent.

**Specific changes:**
1. Registration/binding: struct vs func, nil-pointer method, `RegisterActivityWithOptions`, proto
   `RegisterXxxActivities/Workflows` helpers.
2. DI into activity structs (`&Activities{...}` / `fx.go`); nexus service registration
   (`w.RegisterNexusService`; endpoint is out-of-band → `author-infra`); graceful shutdown.
3. Registration-coverage reality (unregistered type ⇒ task fails; same-queue ⇒ same type set) and the
   TWF↔Go bridge note (`worker`/`namespace`/`task_queue` ↔ `worker.New` + registered set; resolver
   `IMPLICIT_ROUTING_MISMATCH`/`UNCOVERED_*` = design-time preview; also a reverse-reading signal).
4. **Do NOT cover** (deferred to DSL — see `dsl/BACKLOG.md` Worker Runtime Options): `MaxConcurrent*`,
   rate limiters, sticky cache, worker versioning / Build IDs / deployments.
