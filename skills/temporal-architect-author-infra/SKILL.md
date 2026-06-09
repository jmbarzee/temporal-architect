---
name: temporal-architect-author-infra
description: Provision the control-plane resources a .twf design needs — namespaces, Nexus endpoints, search attributes — via the Temporal Cloud Terraform provider or self-hosted tcld / temporal operator CLI. Use when deploying Temporal infrastructure for a workflow design, not worker code.
---

# Temporal Architect: Infrastructure Authoring

Provision the **out-of-band control-plane resources** a `.twf` design depends on, using infrastructure-as-code. The primary goal is real, applied infrastructure — namespaces, Nexus endpoints, and search attributes — that the worker code (`author-go`) can register against and run on. Always produce IaC artifacts (`.tf` files or CLI runbooks) as deliverables.

`author-infra` is the **third implementer** of a design, parallel to `author-go`:

```
design (topology) ──► author-go    (worker code: workflows, activities, registration)
                 └──► author-infra (provisioning: namespaces, endpoints, search attributes)
```

The split is deliberate: `author-go` punts Nexus **endpoint** registration ("out-of-band → infra skill") because it is a Terraform/CLI resource, not worker code. This skill closes that gap. Worker code and the resources it runs on are two different artifacts with two different lifecycles.

---

## Core Principles

**Provision only the topology, not the code.** This skill reads the `.twf` deployment topology — `namespace`, `nexus endpoint` (with its `worker_target`), and worker task queues — and provisions the control-plane resources for it. It never generates workflow or activity code; that is `author-go`'s job.

**The `.twf` is the contract.** Resources derive from declared topology, not invented. If a resource needs an input the `.twf` does not model (see [Not-Yet-Modeled `.twf` Intent](#not-yet-modeled-twf-intent)), ask the user — do not guess at access policies or attribute schemas.

**IaC discipline: one owner per resource.** Once a resource is Terraform-managed, manage it *only* through Terraform. Mixing console/CLI edits with Terraform produces drift that the next `terraform plan` will try to revert. For resources that already exist, `import` them into state before managing — never let Terraform try to create a duplicate.

**User as decision-maker.** The skill owns the mechanical mapping (topology → resource blocks); the user owns consequential choices — deployment target, region selection, retention, auth model, and which caller namespaces an endpoint trusts. Surface these as specific options with tradeoffs, not open-ended questions.

---

## Process

### Orient

Before provisioning, resolve **where the infrastructure lands** along two independent axes — the same model as `author-go`.

| Axis | Existing infra | Greenfield |
|------|----------------|------------|
| **1. Greenfield vs. existing** | *Detect* — signals below; if any fire, infra already exists | *Ask* the user |
| **2. Deployment target** | *Detect from the repo* and conform to it | *Ask*; no default — Cloud vs self-hosted is a real decision |

**Cheap detection signals** (check these first — no subagent needed):

- `*.tf` with `temporalio/temporalcloud` in `required_providers` → **Temporal Cloud + Terraform**
- existing `temporalcloud_namespace` / `temporalcloud_nexus_endpoint` resource blocks → **Temporal Cloud + Terraform** (and candidates for `import`)
- `tcld` invocations in scripts/CI, or a self-hosted `temporal server` / Helm chart → **self-hosted + `tcld` / `temporal operator`**
- no infra signals at all → greenfield; *ask* the user which target

**Target → reference routing:**

| Target | Load |
|--------|------|
| Temporal Cloud, declarative (Terraform) | [terraform.md](./reference/terraform.md) |
| CLI, imperative (`tcld` for Cloud, `temporal operator` for self-hosted) | [tcld.md](./reference/tcld.md) |

Route on concrete repo signals, never on a name. Adding a target later (e.g. a `helm.md` for k8s worker deployment) = one reference file + one routing row.

**For existing infra, dispatch the shared `project-discovery` subagent** to scan a **bounded slice** (the `.tf` directory or the namespace in scope — never the whole repo) and return a compact summary of existing providers, resource blocks, namespaces, endpoints, and any `.twf` for this domain. Trigger it deliberately; if the slice is unclear, narrow it with the user first. Its contract lives in [project-discovery-subagent.md](../temporal-architect-design/reference/project-discovery-subagent.md) (owned by the design skill, shared across skills; it scans `.tf` as well as `.twf` and code). Consume its summary — don't re-scan in the main context.

### 1. Read the Topology

From the `.twf` in scope, extract the deployment topology only:

- every `namespace` block and its name
- every `nexus endpoint` and its `worker_target` (the target namespace + `task_queue` it routes to)
- worker task queues (they inform each endpoint's `worker_target` and confirm which namespace a worker runs in)

Ignore workflow/activity bodies — they are `author-go`'s concern, not infrastructure.

### 2. Map Topology to Resources

This is the contract from `.twf` to control-plane resources:

| `.twf` construct | Temporal Cloud (Terraform) | Self-hosted (CLI) |
|------------------|----------------------------|-------------------|
| `namespace Name:` | `temporalcloud_namespace` | `temporal operator namespace create` / `tcld namespace create` |
| `nexus endpoint Name` (`worker_target` = namespace + `task_queue`) | `temporalcloud_nexus_endpoint` (`worker_target { namespace_id, task_queue }`) | `tcld nexus endpoint create --target-namespace --target-task-queue` |
| worker `task_queue` option | informs the endpoint's `worker_target.task_queue`; not itself a resource | same |
| custom search attribute *(not yet in `.twf` — see below)* | `temporalcloud_namespace_search_attribute` | `temporal operator search-attribute create` |
| endpoint access policy *(not yet in `.twf` — see below)* | `allowed_caller_namespaces` on the endpoint | `--allow-namespace` / `tcld nexus endpoint allowed-namespace` |

Task queues are **not** standalone resources — they exist implicitly when a worker polls them. The endpoint's `worker_target` is what makes a task queue routable for Nexus.

### 3. Provision + Verify

Follow the target's reference file. Verify with the target's plan/apply (or dry-run) before applying for real:

- **Terraform:** `terraform init` → `terraform plan` (review the diff — especially any unexpected create on a resource that should be imported) → `terraform apply`.
- **CLI:** run `... list` / `... get` to confirm current state before `create`; re-run after to confirm.

For existing infra, `import` before plan so Terraform manages rather than recreates. See each reference for the import workflow.

After provisioning: present the resources created/changed and how they line up with the `.twf` topology and the worker code's expectations (task queue names must match what `author-go` registered).

---

## Not-Yet-Modeled `.twf` Intent

Two things the infra author needs are **not yet expressible in `.twf`**:

- **Nexus endpoint access policy** — which caller namespaces may invoke an endpoint (`allowed_caller_namespaces` / `--allow-namespace`). Tracked in `dsl/BACKLOG.md` (Nexus Endpoint Access Policy).
- **Custom search attributes** — namespace-level attribute declarations (name + type). Tracked in `dsl/BACKLOG.md` (Custom Search Attributes).

Until the grammar lands, **ask the user** for these (or read an interim annotation if the project uses one) rather than inventing them. Do not default an endpoint to "allow all callers" or guess attribute types — both are security- and schema-relevant. When the DSL backlog items are promoted, this skill consumes them from the topology like any other resource and the asking step drops away.

---

## Output Conventions

- Terraform: group resources for one `.twf` design into a module or a single `.tf` file alongside the `.twf` (or where the user's IaC lives); never scatter a design's resources across unrelated state.
- CLI: produce an ordered, idempotent runbook (`list`/`get` guard → `create`) the user can paste or commit, not a one-off transcript.
- Name resources after their `.twf` identifiers so the topology↔infra mapping stays legible.

---

## Reference Index

Read only the reference for the detected (or chosen) deployment target.

| Target | File |
|--------|------|
| Temporal Cloud, declarative — Terraform (`temporalio/temporalcloud`) | [terraform.md](./reference/terraform.md) |
| Imperative CLI — `tcld` (Cloud) / `temporal operator` (self-hosted) | [tcld.md](./reference/tcld.md) |

Shared:

| Topic | File |
|-------|------|
| Bounded-slice repo discovery (existing infra) | [project-discovery-subagent.md](../temporal-architect-design/reference/project-discovery-subagent.md) |
| Namespace count / boundary decisions (a *design* call, upstream of provisioning) | [namespaces.md](../temporal-architect-design/reference/namespaces.md) |
