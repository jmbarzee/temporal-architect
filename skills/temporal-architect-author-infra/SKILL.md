---
name: temporal-architect-author-infra
description: Provision the control-plane resources a .twf design needs — namespaces, Nexus endpoints, search attributes — via the Temporal Cloud Terraform provider or self-hosted tcld / temporal operator CLI. Use when deploying Temporal infrastructure for a workflow design, not worker code.
---

# Temporal Architect: Infrastructure Authoring

Provision the **control-plane resources** a `.twf` design depends on — namespaces, Nexus endpoints, search attributes — as applied infrastructure-as-code, delivered as `.tf` files or CLI runbooks. It also owns the Nexus endpoint registration `author-go` leaves out-of-band.

## Principles

- **Provision the topology, never code.** Read only `namespace`, `nexus endpoint` (with its `worker_target`), and worker task queues; workflow and activity bodies belong to `author-go`.
- **The `.twf` is the contract.** Derive resources from declared topology. What the `.twf` cannot express yet (below), ask for — never invent.
- **One owner per resource.** Once Terraform manages a resource, change it only through Terraform; `import` what already exists rather than letting Terraform create a duplicate.
- **The user decides.** You own the mechanical mapping; the user owns deployment target, regions, retention, auth model, and which caller namespaces an endpoint trusts. Offer specific options with tradeoffs. Namespace *count* is a design call upstream of this skill ([namespaces.md](../temporal-architect-design/reference/namespaces.md)).

---

## Orient

Resolve two axes before provisioning:

| Axis | Existing infra | Greenfield |
|------|----------------|------------|
| **Greenfield vs. existing** | *Detect* — any signal below means infra exists | *Ask* |
| **Deployment target** | *Detect* and conform | *Ask* — Cloud vs self-hosted is a real decision; no default |

Signals, cheapest first:

- `*.tf` with `temporalio/temporalcloud` in `required_providers`, or existing `temporalcloud_namespace` / `temporalcloud_nexus_endpoint` blocks (`import` candidates) → **Cloud + Terraform** → [terraform.md](./reference/terraform.md)
- `tcld` in scripts/CI, or a self-hosted `temporal server` / Helm chart → **CLI** (`tcld` for Cloud, `temporal operator` for self-hosted) → [tcld.md](./reference/tcld.md)
- none → greenfield; ask which target.

Route on concrete repo signals, never on a name, and read only the matching reference.

For existing infra, dispatch the shared [`project-discovery` subagent](../temporal-architect-design/subagents/project-discovery.md) on a **bounded slice** — the `.tf` directory or namespace in scope, never the whole repo — and consume its summary rather than re-scanning. If the slice is unclear, narrow it with the user; if the target spans multiple slices, use the design skill's [slice decomposition](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices).

---

## Map topology to resources

| `.twf` construct | Temporal Cloud (Terraform) | CLI |
|------------------|----------------------------|-----|
| `namespace Name:` | `temporalcloud_namespace` | `tcld namespace create` / `temporal operator namespace create` |
| `nexus endpoint Name` (`worker_target` = namespace + `task_queue`) | `temporalcloud_nexus_endpoint` (`worker_target { namespace_id, task_queue }`) | `tcld` / `temporal operator nexus endpoint create --target-namespace --target-task-queue` |
| worker `task_queue` option | informs the endpoint's `worker_target.task_queue` | same |
| custom search attribute *(not in `.twf`)* | `temporalcloud_namespace_search_attribute` | `temporal operator search-attribute create` |
| endpoint access policy *(not in `.twf`)* | `allowed_caller_namespaces` | `--allow-namespace` / `tcld nexus endpoint allowed-namespace` |

Task queues are not resources: they exist once a worker polls them, and an endpoint's `worker_target` is what makes one routable for Nexus. The endpoint **name** is what caller code invokes, and the **target task queue** is what the handler worker polls; both must match the `.twf` and `author-go`'s output, or Nexus tasks route nowhere.

### Not yet modeled in `.twf`

Endpoint access policy (which caller namespaces may invoke it) and custom search attributes (name + type) have no grammar yet ([#8](https://github.com/jmbarzee/temporal-architect/issues/8)). Ask the user, or read an interim annotation if the project uses one. Never default an endpoint to allow-all or guess an attribute type — both are security- and schema-relevant.

---

## Provision and verify

Follow the target's reference and preview before applying: for Terraform, `init` → `plan` (review the diff) → `apply`; for CLI, run the guarded runbook below and re-check afterwards. Then present what was created or changed, mapped to the `.twf` topology.

**Output conventions:**

- Terraform: keep one design's resources in one module or `.tf` file beside the `.twf` (or where the user's IaC lives) — never scattered across unrelated state.
- CLI: an ordered, idempotent runbook (`list`/`get` guard → `create`) the user can commit, not a one-off transcript.
- Name resources after their `.twf` identifiers.
