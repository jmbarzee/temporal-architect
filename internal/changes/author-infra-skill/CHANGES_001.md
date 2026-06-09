# Author-Infra Skill Changes

**Source review(s):** skill-retro planning session (Stage 2 / item D1)
**REVISIONS file(s):** `internal/changes/author-infra-skill/REVISIONS_001.md` (Groups 1–4)

## Summary

New skill `temporal-architect-author-infra` — the **third implementer** of a `.twf` design, parallel
to `author-go`: design (topology) → { `author-go` (worker code), `author-infra` (provisioning) }. It
consumes the `.twf` deployment topology (`namespace`, `nexus endpoint` `worker_target`, worker task
queues) and provisions the out-of-band control-plane resources via the Temporal Cloud Terraform
provider (`temporalio/temporalcloud`) or the imperative `tcld` / `temporal operator` CLIs. This closes
the Nexus **endpoint** registration `author-go` deliberately punts as out-of-band infra. No DSL/tooling
changes — all author against today's grammar.

## Changes by Type

### Internal

- **`skills/temporal-architect-author-infra/SKILL.md`** (new): description triggers on provisioning
  Temporal infra (namespaces, Nexus endpoints, search attributes), not worker code. Cheap-body /
  heavy-payload routing model mirroring `author-go`: Core Principles (provision topology not code;
  `.twf` is the contract; **IaC discipline — one owner per resource**, `import` before manage to avoid
  drift; user as decision-maker). **Orient** resolves two axes — greenfield-vs-existing (detect for
  existing via `.tf`/`temporalcloud_*` signals, ask for greenfield) and deployment target (Temporal
  Cloud+Terraform vs imperative CLI) — with a `target → reference` routing table and deliberate dispatch
  of the shared `project-discovery` subagent (now also scanning `.tf`). Topology→resource mapping table
  (`namespace` → `temporalcloud_namespace`; `nexus endpoint` `worker_target` → `temporalcloud_nexus_endpoint`
  `worker_target{namespace_id, task_queue}`; task queues inform `worker_target`, not standalone resources).
- **`skills/temporal-architect-author-infra/SKILL.md`** (Group 4 — Not-Yet-Modeled `.twf` Intent): a
  handling note that **endpoint access policy** (`allowed_caller_namespaces`) and **custom search
  attributes** are not yet expressible in `.twf` (both tracked in `dsl/BACKLOG.md`); until the grammar
  lands the skill **asks** rather than inventing — explicitly no allow-all default, no guessed attribute
  types — and will consume them from topology once the backlog items are promoted.
- **`skills/temporal-architect-author-infra/reference/terraform.md`** (new): Temporal Cloud provider
  setup (`temporalio/temporalcloud`, `TEMPORAL_CLOUD_API_KEY`); `temporalcloud_namespace` (cloud-prefixed
  `regions` 1–2 for HA, `retention_days`, `api_key_auth` vs `accepted_client_ca`,
  `namespace_lifecycle.enable_delete_protection`, region-change-not-supported caveat);
  `temporalcloud_namespace_search_attribute` (`name`/`type`); `temporalcloud_nexus_endpoint`
  (`worker_target`, `allowed_caller_namespaces`); the `import` + drift workflow (import before plan,
  reconcile to a clean plan, single-owner discipline) and an init→plan→apply verify loop.
- **`skills/temporal-architect-author-infra/reference/tcld.md`** (new): imperative CLI path —
  distinguishes `tcld` (Cloud) from `temporal operator` (self-hosted OSS); idempotent `list`/`get`-guarded
  runbook discipline; namespace create, search-attribute create, and Nexus endpoint create
  (`--target-namespace`/`--target-task-queue`/`--allow-namespace`, plus
  `tcld nexus endpoint allowed-namespace add|list|set`) for both CLIs; verify commands; a note flagging a
  future `helm.md` (k8s worker deployment) variant.
- **`skills/temporal-architect-author-infra/README.md`** (new): one-page skill summary
  (goal/focus/scope/references/entry-point) for parity with `temporal-architect-author-go/README.md`.

## Notes

- References live under `reference/` (singular), matching the existing skills (`author-go`, `design`);
  the REVISIONS file's `references/` (plural) was a typo — same correction as author-go CHANGES_001.
- `README.md` was added for sibling-skill parity; it is not called out in the REVISIONS file.
- The skill is auto-discovered by the bundle generator (`internal/release/gen-skills-manifest/` walks
  `skills/`), so no manifest/catalog registration is required.
- The shared `project-discovery` subagent is referenced by contract; its spec is owned by the design
  skill (`skills/temporal-architect-design/reference/project-discovery-subagent.md`). Cross-links to
  `namespaces.md` and the subagent reference point into the design skill.
- Downstream echoes (dependency-map / README mentions of the new skill — ordered plan F2/F3) are out of
  scope for this cycle and tracked separately.
