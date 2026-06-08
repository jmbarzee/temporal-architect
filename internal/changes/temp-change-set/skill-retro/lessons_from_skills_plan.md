# Plan: temporal-architect skill & tooling work

Working space + ordered task list. Seeded by `lessons_from_skills_on_existing_project.md`
(reverse-engineering 10 Go proto-first domains into `.twf`), expanded into a broader skill/tooling
agenda. We walk the **Worklist** top → bottom, one item at a time, promoting confirmed items into
the real component backlogs (`internal/changes/<component>/BACKLOG.md`) as we go.

Status keys: `[ ]` staged · `[~]` discussing · `[x]` done · `[?]` open question

---

## North Star (why this project exists)

`.twf` exists to **extend the complexity horizon of AI execution** — let AI work at *system* scale,
not code scale. (Atlas analogy: you don't cross the country on square-mile maps.) The biggest gains
in AI-assisted dev came from wiring AIs into **deterministic tooling** — compilers, linters, testers.
temporal-architect aims to be that deterministic harness for **Temporal architecture**: keep the AI
out of the weeds (error handling, library choices, application-code pedantics) so it can focus on the
large scale — **workloads, scaling, reliability, availability**.

Consequence: the product is a **thoughtful, context-protecting harness for the main agent**, so we
fit bigger problems into the same context window. (Open: the "main agent" isn't always the *design*
agent — sometimes author/reverse. Don't assume.)

## Locked decisions

- **Split skills by SDK.** Rationale: per-language nuance, especially **workers** (registration, task
  queues, setup). Consequence: **no standalone `extract` skill** — reverse knowledge routes
  *design (general how/when) → relevant author skill (SDK specifics, incl. proto)*. This is the
  hierarchical-routing the skill-scope research endorses for a small, cohesive library.
- **All `.twf` in one package for now** (confident interim) — pending a real DSL package solution.
- **Tier-1 doc fixes shipped** (see Done).
- **Adoption is the dominant onboarding path**, not greenfield — skills should reflect that.

## Conventions

- Edit the **canonical repo source** under `skills/…`, not the installed `~/.cursor/skills/` copy.
- Cross-layer (parser/DSL/packaging) items get a `{LAYER}_CHANGES.md` via `/project:propagate-changes`
  — not skill prose. High bar.
- Verify parser/CLI claims against the shipped `twf` before documenting them as fact.

---

## Stages (dependency-ordered handoff)

This is the **implementation order**. Each stage is self-contained enough to hand off (ideally as
`internal/changes/<component>/REVISIONS_NNN.md` + `/project:address-review`). Item IDs (A0, B1, C6, …)
point into **Item detail (by component)** below for the full decision + rationale.

**Open gate:** the **harness skill name** (`temporal-engineer` vs `temporal-architect`-as-umbrella)
blocks Stage 4 and the user-facing North Star wording (F2/F3). Settle before Stage 4.

### Stage 0 — DONE
- Tier-1 doc fixes (`SKILL.md` `--lenient`; `common-errors.md` body-less + nexus-cliff). Shipped.

### Stage 1 — Independent skill content (no new DSL/tooling deps) — *ready to hand off*
Parallelizable; each is doc/skill authoring against today's grammar.
- **author-go** (A0–A4) → `author-go-skill` REVISIONS:
  - A0 Orient (greenfield→ask / existing→detect; codegen-variant routing table in body).
  - A1/A2 write `references/proto-driven.md` (proto-first variant payload + setup).
  - A3 write `references/three-layer-testing.md` + promote testing as a recommended step in the body.
  - A4 expand `reference/worker.md` (Go-specific wiring; defer tuning/versioning to C6).
  - **Source material:** `PROTO_DRIVEN_TEMPORAL.md` + `THREE_LAYER_TESTING.md` (distill into the two
    references, then delete the root docs — they are Stage-1 input, not shipped).
- **design** (B1, B2) → `design-skill` REVISIONS:
  - B1 reverse-engineering as a subagent parallel path (trigger + reference + subagent prompt);
    fidelity-first → Design Review; delegate SDK reading to author skills.
  - B2 one-package recommendation + top-of-file impl-link comment convention.
- **B1c shared project-discovery subagent** — the primitive reused by A0 / B1a / B1b (and later D1).
  Build once here.
- **packaging M3** (C5) → `packaging.md` (already drafted): extension symlinks `twf` into `~/.local/bin`.
- **F1** dev-repo `AGENTS.md` North Star (dev-agent guidance only).

### Stage 2 — New `author-infra` skill (D1)
- Skill with Orient + variant references (`terraform.md`, `tcld.md`; room for `helm.md`); consumes
  `.twf` namespace/endpoint/worker topology; greenfield/existing + drift via B1c discovery subagent.
- No new DSL needed (uses existing topology constructs).

### Stage 3 — DSL / parser features (each its own REVISIONS, capacity-sequenced)
1. **Entry Point Annotation** (prereq for reachability + E2).
2. **E2 graph-tree decomposition tooling** (`parser/graph/` + `twf graph trees/chunks`).
3. **C6 worker options** (parser-permissive union; no language check).
4. Larger DSL designs (lower priority, deferred): C1 packages / general `extern` (subsumes C3),
   C2 `@ref`, Nexus endpoint access policy, Custom search attributes.

### Stage 4 — Harness / entry-point skill (E0) — *capstone*
- Needs: Stage 1–2 skills exist; ideally Stage 3 graph-tree tooling; **the name decision**.
- Entry-point skill: flows by project-state + user-request; contract-boundary decomposition; dispatch
  to design/authors/infra; carries the user-facing North Star. Then **F2/F3** echo it.

### Parallel / early — Process
- **G1 baseline reflection pass** — run *early* (surfaces blind spots before locking Stage 1 skill
  changes), not last. Independent of all stages.

---

## Item detail (by component)

Full decision + rationale per item; the **Stages** section above sequences these for handoff.

### A. `author-go` skill → `author-go-skill/BACKLOG.md`

- [x] **A0 (spine) Orient step resolving two independent axes — AGREED.** author-go gains an Orient
  step (symmetric to design's Orient). **Axis 1** greenfield vs existing: **detect** for existing
  repos, **ask** for greenfield. **Axis 2** codegen variant (proto-first vs hand-written vs …): for
  existing, *detect from the repo* (and treat its conventions — worker layout, registration style,
  proto pipeline — as requirements to match); for greenfield, *ask*. Greenfield **default =
  hand-written**; proto is primarily the adopt-existing branch + an explicit greenfield opt-in (its
  cascade into registration/worker only fires when demanded).
  - **Routing design (serves North Star — context protection):** main `SKILL.md` body holds only the
    cheap layer — Orient + **detection signals** (`buf.gen.yaml` / `*.pb.go` / Temporal proto plugin →
    proto-first) + a small **routing table** (`variant → reference file`). Each codegen variant is a
    **Level-3 reference** (`references/proto-first.md`, room for more) holding the heavy payload, loaded
    only when its signal fires. Extensible: new variant = 1 reference file + 1 routing row, no binary
    if/else in the body. "Visited when applicable" = trigger signals live in the cheap body; payload
    stays out of context until needed.
- [x] **A1 Naming — RESOLVED.** Extension reference = **`references/proto-driven.md`** (descriptive,
  matches source doc title). Route on **concrete repo signals** (`buf.gen.yaml` → `protoc-gen-go_temporal`,
  generated `*_temporal.pb.go`, `(temporal.v1.activity|workflow)` annotations) — never on an acronym.
  **"PFI" kept as a documented alias/keyword** so early-AI-tooling prompts still route. ("PFI" = a
  coined AI-tooling label for this proto-driven pattern, not an industry term.)
- [ ] **A2 Proto setup** → goes in `proto-driven.md`. Distilled essentials below.
- [x] **A3 Mocks / testing — RESOLVED: independent of proto, and PROMOTED to recommended practice.**
  Three-layer testing is "spectacular practice for a clean Go Temporal project" → surface it **in the
  author-go main flow as a recommended step/phase** (with the *why*), mechanics in
  `references/three-layer-testing.md`. **Generated mocks = an option within testing** (the proto seam),
  not a requirement. (Refines A0's routing model — three tiers: (1) *recommended practice* promoted
  into the body w/ reference for mechanics [testing]; (2) *variant extension* invisible until signals
  fire [proto-driven]; (3) *option within a practice* [generated mocks].)
- [x] **A4 Worker section — RESOLVED (scoped by North Star).** Existing `worker.md` is solid;
  *expand* with Go-specific, durable bits that are **not** downstream of eventual DSL worker-options:
  registration/binding mechanics (struct vs func, nil-pointer method, `RegisterActivityWithOptions`,
  proto `RegisterXxx` helpers); **DI into activity structs** (`&Activities{...}` / `fx.go`); **nexus
  service registration** (`w.RegisterNexusService`; endpoint out-of-band → infra skill); graceful
  shutdown (`InterruptCh`/`Stop`); registration-coverage reality (unregistered type ⇒ task fails;
  same-queue ⇒ same type set); **TWF↔Go bridge note** (`worker`/`namespace`/`task_queue` ↔ `worker.New`
  + registered set; resolver `IMPLICIT_ROUTING_MISMATCH`/`UNCOVERED_*` = design-time preview; also a
  reverse-reading signal). **Deferred to DSL (do NOT cover):** concurrency caps (`MaxConcurrent*`),
  rate limiters, sticky cache, worker versioning / Build IDs / deployments → see C6.

> **Source material:** `PROTO_DRIVEN_TEMPORAL.md` + `THREE_LAYER_TESTING.md` (exhaustive — distill,
> don't echo). Generator stack: `cludden/protoc-gen-go-temporal` (`protoc-gen-go_temporal`) +
> `alta/protopatch` + `buf`; optional Nexus via `bergundy/protoc-gen-go-nexus[-temporal]`; mocks via
> `vektra/mockery`.

**Distilled essentials → `proto-driven.md` (key parts only, get a dev running):**
1. Contract + layout: `proto/` (source of truth) → `gen/` (generated, never edit; `*.pb.go`,
   `*_temporal.pb.go`) → `lib/` (hand-written `activities.go`, `workflows.go`, `client.go`, `fx.go`).
2. Tools: `buf` + `protoc-gen-go-patch` + `protoc-gen-go_temporal` (+ optional nexus plugins),
   `go install` from go.mod; on `$PATH` for `buf generate`.
3. Config skeletons: `buf.yaml` (modules/deps/lint exceptions — note `XxxInput/XxxOutput`, not
   Request/Response) + `buf.gen.yaml` (plugin pipeline) → `buf generate`.
4. Proto annotations: `(temporal.v1.service)` task_queue; `(temporal.v1.activity|workflow)` name +
   timeouts; `(go.field).tags` via protopatch.
5. **Generated-symbol table = the Rosetta Stone** (dual-purpose; see B1 reverse): `XxxActivities`
   iface, `RegisterXxxActivities`, `XxxActivityName` const, `XxxFuture`, `XxxWorkflows`,
   `RegisterXxxWorkflows`, `XxxClient`.
6. Implement (validate→call→return), register at worker startup (fx), hand-written client interface
   (for mocking).

**Distilled essentials → `three-layer-testing.md`:**
- Three layers, each mocks only its direct dependency: **Workflows** (mock generated activities
  iface, `WorkflowTestSuite`), **Activities** (mock hand-written client iface), **Clients** (real,
  `//go:build integration` + testcontainers). Patterns: conditional mocks mirror validation flow;
  fresh env per table case; split constructor/validation tests from execution tests.

### B. `design` skill → `design-skill/BACKLOG.md`

- **B1 Reverse engineering (code → `.twf`): how & when.** `.twf` is the **central, living design
  medium**, not a sketch. **Delivered as a subagent-driven PARALLEL PATH, not inline design-flow
  content** — this is both the anti-pollution mechanism (keeps the main/greenfield loop fast) and the
  North-Star context-protection move (discovery/sync runs in isolated subagent context, returns a
  summary). Main skill body = a thin trigger + optional subagent dispatch; reverse *mechanics* live in
  a reference + the subagent prompt. **Trigger discipline:** deliberate, on reasonably-sized portions,
  never reflexively. Common content: reading strategy (find entry points + activity/child/nexus call
  sites; ignore error/ctx/options plumbing; detect parallelism); **delegate SDK specifics to the
  relevant author skill** (read its symbol tables — incl. `proto-driven.md` — *backward*);
  **fidelity-first, THEN the existing Design Review** (capture anti-patterns faithfully, don't silently
  fix); design-intent stubs only for genuinely-unimplemented; interim cross-domain stub convention
  (`# cross-domain stub — defined in X.twf`, workaround for missing C1).
  - [ ] **B1a Bootstrap** (no `.twf`): discovery subagent scans a bounded slice → extract → fidelity →
    Design Review.
  - [ ] **B1b Drift/sync** (`.twf` incomplete/desynced): check/sync subagent on a bounded slice →
    reconcile. *Sync* half depends on **C2** (twf↔impl mapping); *check/discovery* half is independent.
  - [ ] **B1c Shared project-discovery subagent** (convergence): one primitive — "scan an existing repo
    for tooling/layout/conventions/Temporal usage on a bounded slice, return a summary" — serves
    **A0** (author-go existing-repo detection), **B1a**, and **B1b**. Matches `author-go/
    SUBAGENT_ADOPTION.md`'s `sdk-explorer` open question. Design once, reuse across design + author.
- [x] **B2 Package & `.twf` placement — RESOLVED.** Skill **recommends one package** for all `.twf`,
  presented as the recommendation (do **NOT** frame it as temporary/stopgap in skill prose — keep that
  honesty in this backlog only). Mapping mechanism: **a top-of-file comment in each `.twf` linking to
  its implementation dir(s)** — the lightweight twf↔impl link that one-package layout otherwise loses.
  - Doubles as a reverse-engineering aid (discovery subagent reads it to find code; extraction writes it).
  - Joins `# cross-domain stub — defined in X.twf` to form a small, named set of **`.twf` comment
    conventions**. (Durable DSL solution still tracked as C1/C2 — not surfaced in skill prose.)

### C. DSL / parser → PROMOTED to `dsl/BACKLOG.md` + `parser/BACKLOG.md`

- [x] **C1 Packages / cross-package references** → dsl `## Packages and Project Structure`. Deferred;
  one-package routes around it; value is future per-package co-location.
- [x] **C2 `.twf` ↔ impl mapping** → *augmented* existing dsl `### Reference Annotations` (`@ref`):
  header-comment interim, one-package elevation, discovery-subagent reads/writes it.
- [x] **C3 Nexus external refs — REFRAMED (S2).** Do **not** ship a nexus-specific `extern` as the
  cliff fix; fold into the general C-header-like "declared elsewhere" mechanism (= C1). Once that
  exists the cliff dissolves; unmarked-unresolved stays a warning. Kept as the *general* concept,
  de-scoped from a nexus-only keyword. (Steer written into dsl + parser backlog entries.)
- [x] **C4 Body-less-definition diagnostic** → parser `## Clearer Diagnostic for Body-less Definitions`
  (notes the non-reproducing `DEDENT` claim too).
- [x] **C5 Agent-discoverable `twf` on PATH — DECIDED → `packaging.md` M3.** Confirmed empirically the
  extension's `environmentVariableCollection` PATH prepend does NOT reach the agent shell. Fix: extension
  symlinks bundled `twf` into `~/.local/bin` (on agent PATH; holds `claude`), version-refreshed, with a
  don't-clobber guard. Visualizer isn't a CLI — agent surface is `twf graph --json`.
- [x] **C6 Worker options — DECIDED (S2).** TWF worker options = union/superset of SDK worker options
  (excl. per-language one-offs); **parser permissive, no language check**. Strategy/intent at altitude,
  not numeric ops tuning. (Recorded in dsl `### Worker Runtime Options and Versioning / Deployment`.)
- [x] **C6b Codec config** — already a rich dsl entry (`### Codec Server / Payload Codec Configuration`,
  incl. cross-worker codec-compatibility validation). Confirmed; language shape still open.

### D. New skill (candidate)

- [x] **D1 `author-infra` skill — DECIDED.** The **third implementer** of the `.twf` design, parallel
  to `author-go`: design (topology) → {author-go (code), author-infra (provisioning)}. Consumes the
  `namespace` / `nexus endpoint` (`worker_target`) / worker-task-queue topology and provisions the
  out-of-band control-plane resources. **Name `author-infra`** (general → expandable to helm, etc.).
  - **Variant routing (like proto-vs-hand-written):** same resources, different tool → Orient detects
    target, routes to `references/terraform.md` (Temporal Cloud), `references/tcld.md` (self-hosted
    `tcld`/`temporal operator`), room for `helm.md` (k8s).
  - **Greenfield/existing + drift:** `terraform import` for existing infra, drift reconciliation —
    the **third** consumer of the shared project-discovery subagent (A0 / B1c), now also scanning `.tf`.
  - **Scope:** namespaces, nexus endpoints (`worker_target` + `allowed_caller_namespaces`), search
    attributes. **Out (pure ops, not design-derived):** users / service accounts / API keys / billing.
  - **Closes A4's punt:** the Nexus *endpoint* author-go deferred ("out-of-band → infra skill") is a
    Terraform/CLI resource here, not worker code.
  - **TWF gaps surfaced → DSL backlog (added):** *Nexus Endpoint Access Policy* (`allowed_caller_namespaces`),
    *Custom Search Attributes*.

### E. Harness / entry-point skill (subsumes E1)

- [x] **E0 Harness = a published entry-point SKILL — DECIDED.** Correction: the shipped product is a
  **skill set**; there is **no always-on AGENTS file for the user** (that's our dev tooling). So the
  harness can't be AGENTS.md — it must be a **skill whose `description` makes it the de-facto entry
  point** (the only "always-on for the user" mechanism we have). Name TBD (lean `temporal-engineer`
  vs `temporal-architect`-as-umbrella).
  - **Owns:** general flows selected by **project-state + user-request**; decomposition (via the new
    graph-tree tooling, F-below/parser); dispatch + reconciliation to design / authors / infra.
  - **Decomposition principle:** cut at contract boundaries (`.twf` *is* the contract), never finer —
    coarsest = per language; within a language = per workflow-tree (independent roots); cross-language
    interface layer = harness pins that one boundary contract. Pin types/signatures **once** (author-go
    Layer-1 generalized) before parallelizing bodies → avoids repeated work + conflicting API decisions.
  - **Scopes everyone downstream:** design = produce/review `.twf`; authors = implement a chunk; infra
    = provision. Pulls the routing/Handoff logic **out of** design.
  - **North Star home:** lives in THIS skill's description + body (entry point = the only user-facing
    "always-on"). Plus README + published descriptions (F2/F3).
- [x] **E1 Handoff protocol — subsumed by E0.** It's a harness responsibility, not design's: load
  design + **one** language-author + optional `author-infra` (orthogonal); **never co-load two
  SDK-language authors** — for a genuine cross-language *interface layer* (uncommon, not rare), the
  harness pins the boundary contract and dispatches isolated per-language author subagents. `@lang`
  annotations (coming to the spec) become the dispatch key — don't over-engineer routing now.

- [ ] **E2 Graph tree/chunk decomposition tooling** → `parser/BACKLOG.md` *Graph Decomposition:
  Composable Chunks / Workflow Trees* (added). Extend `parser/graph/` to enumerate independent trees +
  AI-selectable decomposition strategies; CLI surface (`twf graph trees`/`chunks`). Depends on Entry
  Point Annotation. The harness's tool-computed "what are the chunks?".

### F. Project docs (write up the North Star)

- [ ] **F1** `AGENTS.md` — **dev-repo only** (guidance for agents building temporal-architect). NOT the
  user-facing entry; the user-facing North Star lives in the harness skill (E0).
- [ ] **F2** Main `README`.
- [ ] **F3** Distributed/published package descriptions (+ harness skill description carries the philosophy).

### G. Process

- [ ] **G1 Baseline reflection pass** — the source reflection ran 0 sub-agents (context exhausted).
  Run the mandated baseline (zero-context) + case agents on the 10 `.twf` artifacts to surface blind
  spots before locking the bigger skill changes.

---

## Done

- **Tier-1 doc fixes** (verified against `twf` v0.8.3, committed to skill source):
  - `SKILL.md`: corrected `--lenient` (line 16 + CLI table) — it forces exit 0 but **suppresses
    nothing**; previous "partial tolerance for incomplete designs" was misleading.
  - `common-errors.md`: added the `expected COLON` (definition-needs-`:`+body) row; added a named
    "Nexus resolution: external (warning) vs. local (error)" subsection with the per-category cliff
    table + gotcha.
  - Dropped the phantom "`DEDENT` from nested constructor" rule (does not reproduce on v0.8.3).

---

## Appendix — findings (reference)

### Verified parser behavior (twf v0.8.3)
- `activity Foo(Thing{n: Make()})` checks clean — grammar allows `call_expr` inside `constructor_expr`
  fields. The reflection's "DEDENT at top level" rule does not reproduce.
- Definitions require `:` + an indented body; a bare decl → `expected COLON, got NEWLINE` + cascading
  `UNDEFINED_*`. Comment-only body parses but warns `EMPTY_ACTIVITY` (needs ≥1 statement for clean).
- `--lenient` = "exit 0 even if errors present"; prints all errors, suppresses none.
- Nexus cliff is **per-category**: any local `nexus service` flips all service refs
  `NEXUS_UNRESOLVED_SERVICE` (warn, exit 0) → `NEXUS_UNDEFINED_SERVICE` (error, exit 1); endpoints are
  an independent axis (defined in `namespace` blocks). Facts exist in `spec resolution-and-errors` but
  scattered, never named.

### Temporal SDK grounding (temporal-docs MCP)
- Nexus **endpoint** = out-of-band reverse proxy registered in the **Registry** (UI/CLI/Terraform),
  routes to one target namespace+task-queue the caller never sees → unresolved endpoint refs are the
  normal caller-side state (warning is faithful). **Service** = operation contract (async=start wf;
  sync ≤10s). Codebases are routinely **caller + provider both** → the resolution cliff is a smell (C3).
- Go call sites: `workflow.ExecuteActivity(ctx, Fn|"Name", args…)`, `ExecuteChildWorkflow(...)`;
  activity id = function ref OR string constant (generated constants = the string form); **options are
  context-scoped** (`ctx = WithActivityOptions(ctx, ao)` applies to all later calls on that ctx).

### author-go audit (settles author-go-gap vs. reverse-skill)
- Forward (TWF→Go) mappings for nearly every reverse-reading concern already exist in author-go,
  reading right-to-left: `activity-call.md` (string vs fn vs nil-pointer method), `options.md`
  (context-scoped options; shared vs inline), nexus client mapping + option-key map, parallel patterns
  (`workflow.Go`/`WaitGroup.Go`/`Selector` → await all/one/promise). → These are **directional-framing
  gaps, not knowledge gaps** → design reverse section stays thin and delegates.
- The one genuinely reverse-only / absent item is the **proto-first codegen layer** (generated name
  constants, constructor+Execute split, `buf generate`, proto `tags`) → lives in author-go (A1), since
  author-go correctly teaches idiomatic hand-written Go, and this is a framework layered on the SDK.
- `author-go/SUBAGENT_ADOPTION.md` already envisions orchestrator + `sdk-explorer` + per-language
  codegen, with `sdk-explorer` open-questioning "should it scan existing project code?" → supports
  per-language workers + design↔author routing rather than a new extract skill.

### Skill-scope research (split-by-SDK rationale)
- Most "modular vs monolithic" writing is about runtime agent *services* (latency/scaling/isolation) —
  a category error for skills (prompt/context artifacts, no hops, no scaling unit).
- What applies: (1) progressive disclosure → unused skills/refs ≈ free; (2) skill-*selection* scaling —
  accuracy is a phase transition (>90% ≤20 skills, degrades past ~30, half-capacity κ≈84–92 on
  GPT-4o-family; synthetic, preliminary). **Key lever is confusability, not count**: similar
  "competitor" skills hurt selection more than distinct ones; hierarchy mitigates.
- Provider bias: Anthropic's "hundreds of skills" narrative serves their ecosystem; independent work
  says the cost is semantic overlap, not headcount.
- For temporal-architect (tiny, cohesive library): size is moot; the only lever is **trigger
  confusability** among adjacent skills. Split-by-SDK is fine because language is a sharp,
  low-confusability discriminator and per-SDK worker *process* differs.

---

## Log

- S1: created plan; Tier 1 reframed to verify-first against in-repo parser.
- S1: verification pass (twf v0.8.3 + temporal-docs MCP) — overturned all three Tier-1 guesses;
  shipped corrected doc fixes; SDK-grounded the nexus cliff as a design smell.
- S1: author-go audit + skill-scope research.
- S2: braindump captured; **split-by-SDK locked**; reorganized into North Star + ordered Worklist.
- S3: worked A→E to decisions, recorded into real backlogs (dsl/parser) + packaging M3; harness =
  entry-point skill (not AGENTS.md); added graph-tree decomposition backlog item.
- S3: **reorganized into dependency-ordered Stages** (handoff lens) atop the by-component detail.
  `PROTO_DRIVEN_TEMPORAL.md` + `THREE_LAYER_TESTING.md` = Stage-1 source material (distill → delete).
