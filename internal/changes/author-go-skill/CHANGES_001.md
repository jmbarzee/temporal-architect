# Author-Go Skill Changes

**Source review(s):** skill-retro planning session (Stage 1)
**REVISIONS file(s):** `internal/changes/author-go-skill/REVISIONS_001.md` (Groups 1–4)

## Summary

`author-go` assumed a greenfield, hand-written project; adoption into an existing repo — often
proto-driven codegen — is the dominant case. This cycle adds an **Orient** step that resolves two
axes (greenfield-vs-existing, codegen variant) with cheap detection signals and a `variant → reference`
routing table, dispatching the shared project-discovery subagent for existing-repo scans. It adds two
Level-3 references (proto-driven, three-layer-testing), promotes three-layer testing to a recommended
practice, and expands `worker.md` with Go-specific durable wiring. No DSL/tooling changes — all author
against today's grammar.

## Changes by Type

### Internal

- **`skills/temporal-architect-author-go/SKILL.md`**: added an **Orient** section (before Context
  Gathering) resolving Axis 1 (greenfield-vs-existing — detect for existing, ask for greenfield) and
  Axis 2 (codegen variant — detect-and-conform for existing, ask for greenfield, default hand-written);
  a cheap detection-signal list (`buf.gen.yaml`→`protoc-gen-go_temporal`, `*_temporal.pb.go`,
  `(temporal.v1.activity|workflow)` annotations); a `variant → reference` routing table; deliberate
  dispatch of the shared `project-discovery` subagent (contract owned by design-skill) for the
  existing-repo scan, with a one-line note folding the resolved `sdk-explorer` open question.
- **`skills/temporal-architect-author-go/reference/proto-driven.md`** (new): the first codegen-variant
  reference — `proto/`→`gen/`→`lib/` layout, tool installs + `buf.yaml`/`buf.gen.yaml` skeletons, proto
  annotations and `XxxInput/XxxOutput` naming, the generated-symbol Rosetta Stone table (`XxxActivities`,
  `RegisterXxxActivities`, `XxxActivityName`, `XxxFuture`, `XxxWorkflows`, `RegisterXxxWorkflows`,
  `XxxClient`), and implement→register→client patterns. "PFI" documented as an alias; routing is on
  repo signals, never the acronym.
- **`skills/temporal-architect-author-go/reference/three-layer-testing.md`** (new): three layers, each
  mocking only its direct dependency (workflows→activities iface with `WorkflowTestSuite`,
  activities→client iface, clients→real system behind `//go:build integration` + testcontainers);
  conditional mocks, fresh env per case, split constructor/validation from execution tests; the proto
  seam (`mockery` on the generated activities interface) presented as an option within testing.
- **`skills/temporal-architect-author-go/SKILL.md`** (testing promotion): upgraded the Tests step to
  recommend the three-layer approach with the *why* (each layer catches bugs the others can't; replay
  safety) and linked the new reference.
- **`skills/temporal-architect-author-go/reference/worker.md`**: expanded with nil-pointer method
  binding, dependency injection into activity structs (`fx`), proto-driven registration helpers, Nexus
  service registration (endpoint creation flagged out-of-band → future `author-infra`), graceful
  shutdown, registration-coverage reality (unregistered type fails the task not the workflow; same-queue
  workers share an identical type set), and the TWF↔Go bridge note tying `worker`/`namespace`/`task_queue`
  to `worker.New` + registered set and the resolver codes
  (`UNCOVERED_WORKFLOW|ACTIVITY|SERVICE`, `IMPLICIT_ROUTING_MISMATCH`) as a design-time preview and
  reverse-reading signal. Worker runtime options (`MaxConcurrent*`, rate limiters, sticky cache, worker
  versioning/Build IDs/deployments) deliberately excluded — deferred to `dsl/BACKLOG.md`.

## Notes

- New references live under `reference/` (singular), matching the existing reference set; the REVISIONS
  file's `references/` (plural) was a typo.
- Source material distilled and then removed: `internal/changes/temp-change-set/skill-retro/PROTO_DRIVEN_TEMPORAL.md`
  and `…/THREE_LAYER_TESTING.md` were input, not shipped content.
- The shared `project-discovery` subagent is referenced by contract; its spec is owned by the design
  skill (`skills/temporal-architect-design/reference/project-discovery-subagent.md`, design-skill
  CHANGES_002).
