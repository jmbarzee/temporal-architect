# Author-Infra Skill Revisions

**Source:** skill-retro planning session
(`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 2 / item D1).
**New skill.** Ships as `temporal-architect-author-infra`.

## Summary

`author-infra` is the **third implementer** of a `.twf` design, parallel to `author-go`:
design (topology) → { `author-go` (code), `author-infra` (provisioning) }. It consumes the `.twf`
`namespace` / `nexus endpoint` (`worker_target`) / worker-task-queue topology and provisions the
out-of-band control-plane resources via the Temporal Cloud Terraform provider (`temporalio/temporalcloud`)
or self-hosted `tcld` / `temporal operator` CLI. This closes the Nexus *endpoint* registration that
`author-go` deliberately punted ("out-of-band → infra skill") — it's a Terraform/CLI resource, not
worker code.

## Group 1: Skill skeleton + Orient + variant routing

**Findings:**
- New skill folder with `SKILL.md` whose `description` triggers on "provision / deploy Temporal infra
  (namespaces, Nexus endpoints, search attributes)". Same routing model as author-go: cheap body
  (Orient + detection signals + `target → reference` table), heavy payload in variant references.
- **Orient (two axes, same as author-go):** greenfield → ask; existing → detect (via the shared
  project-discovery subagent — see `design-skill/REVISIONS_002` Group 2 — now also scanning `.tf`).
  Deployment target: **Temporal Cloud + Terraform** vs **self-hosted + `tcld`/`temporal operator`**.

**Files touched:** `skills/temporal-architect-author-infra/SKILL.md` (new).
**Change type:** `Internal`
**Parallelism:** Depends on the shared discovery subagent (design REVISIONS_002 Group 2). Groups 2–3 independent.

**Specific changes:**
1. Create the skill; `description` as the provisioning entry; Orient + variant routing table.
2. Topology→resource mapping (the contract from `.twf`): `namespace` → `temporalcloud_namespace`;
   `nexus endpoint` (`worker_target` = namespace+task_queue) → `temporalcloud_nexus_endpoint`;
   worker task queues inform `worker_target`.
3. IaC discipline note: once Terraform-managed, manage only via Terraform; `import` existing → drift.

## Group 2: `references/terraform.md` (Temporal Cloud)

**Files touched:** `skills/temporal-architect-author-infra/references/terraform.md` (new).
**Change type:** `Internal`
**Parallelism:** Independent.

**Specific changes:**
1. Provider setup (`temporalio/temporalcloud`, API key auth).
2. `temporalcloud_namespace` (regions, retention, auth, cert rotation), `temporalcloud_namespace_search_attribute`,
   `temporalcloud_nexus_endpoint` (`worker_target`, `allowed_caller_namespaces`).
3. `import` + drift workflow for adopting existing infra.

## Group 3: `references/tcld.md` (self-hosted)

**Files touched:** `skills/temporal-architect-author-infra/references/tcld.md` (new).
**Change type:** `Internal`
**Parallelism:** Independent. (Room for a future `helm.md` variant — k8s worker deployment.)

**Specific changes:**
1. `tcld` / `temporal operator namespace create`, `temporal operator nexus endpoint create`
   (`--target-namespace`, `--target-task-queue`, `--allow-namespace`), search-attribute registration via CLI/API.

## Group 4: Not-yet-modeled `.twf` intent

**Findings:**
- Two pieces the infra author needs aren't in `.twf` yet: **endpoint access policy**
  (`allowed_caller_namespaces`) and **custom search attributes**. Both are tracked in `dsl/BACKLOG.md`
  (Nexus Endpoint Access Policy; Custom Search Attributes). Until the grammar lands, the skill **asks**
  for them (or reads an interim annotation) rather than inventing.

**Files touched:** `SKILL.md` (handling note).
**Change type:** `Internal`
**Parallelism:** Independent; unblocked further by the two DSL backlog items when promoted.
