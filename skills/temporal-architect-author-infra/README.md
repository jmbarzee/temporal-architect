# Skill: Temporal Architect — Infra Authoring

**Goal:** Provision the control-plane resources a validated TWF design depends on — namespaces, Nexus endpoints, and search attributes — as infrastructure-as-code.

**Primary focus:** Topology fidelity. The third implementer of a design, parallel to `author-go`: `author-go` writes the worker code, `author-infra` provisions the resources that code registers against and runs on. Closes the Nexus endpoint registration `author-go` deliberately punts as out-of-band infra.

**Scope:**
- Produces: applied IaC — Terraform (`temporalio/temporalcloud`) or `tcld` / `temporal operator` CLI runbooks
- Consumes: a validated `.twf` file's deployment topology (`namespace`, `nexus endpoint`, worker task queues)
- Does not: generate workflow/activity code, make design decisions, or model worker runtime tuning

**Authoritative references:**
- Temporal Cloud Terraform provider (`temporalio/temporalcloud`) and `tcld` / `temporal operator` CLI docs — current resource and command surface
- `tools/spec/sections/` — source of truth for the `.twf` topology constructs being provisioned

**Entry point:** `SKILL.md` → Orient (detect Cloud+Terraform vs self-hosted CLI) → the matching `reference/` file
