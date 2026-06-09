# Temporal Cloud + Terraform (`temporalio/temporalcloud`)

Provision Temporal Cloud control-plane resources with the official Terraform provider. This is the target when the repo already has `*.tf` referencing `temporalio/temporalcloud`, or when the user chooses Temporal Cloud for greenfield.

## Provider Setup

```hcl
terraform {
  required_providers {
    temporalcloud = {
      source  = "temporalio/temporalcloud"
      version = ">= 0.0.6"
    }
  }
}

provider "temporalcloud" {
  # api_key = "..."   # prefer the env var below over inlining a secret
}
```

Authenticate with a Temporal Cloud API key via the environment — never commit it:

```bash
export TEMPORAL_CLOUD_API_KEY=<your-secret-key>
```

## `temporalcloud_namespace`

Maps from a `.twf` `namespace` block.

```hcl
resource "temporalcloud_namespace" "orders" {
  name           = "orders"
  regions        = ["aws-us-east-1"] # cloud-prefixed; 1 region, or 2 for HA replication
  retention_days = 14

  # Auth: choose ONE model.
  api_key_auth = true
  # accepted_client_ca = base64encode(file("${path.module}/ca.pem"))  # mTLS alternative

  namespace_lifecycle = {
    enable_delete_protection = true # blocks accidental destroy; flip to false before destroying
  }
}
```

Key attributes:

| Attribute | Notes |
|-----------|-------|
| `name` | Must start/end alphanumeric, hyphens allowed. The `.twf` namespace name. |
| `regions` | Cloud-prefixed (`aws-us-east-1`, not `us-east-1`). One region, or two for an HA namespace. **Changing/adding/removing regions on an existing namespace is not supported** — the provider errors. |
| `retention_days` | Workflow history retention. A deliberate cost/compliance choice — ask the user. |
| `api_key_auth` vs `accepted_client_ca` | API-key auth or mTLS client CA. Pick the model the workers will use; this must match `author-go`'s client config. |
| `namespace_lifecycle.enable_delete_protection` | Recommend `true` for anything real. |

## `temporalcloud_namespace_search_attribute`

One resource per custom search attribute. **Not yet modeled in `.twf`** — ask the user for the name and type (see SKILL.md → Not-Yet-Modeled Intent).

```hcl
resource "temporalcloud_namespace_search_attribute" "order_status" {
  namespace_id = temporalcloud_namespace.orders.id
  name         = "OrderStatus"
  type         = "Keyword" # one of: Bool, Datetime, Double, Int, Keyword, KeywordList, Text (case-insensitive)
}
```

## `temporalcloud_nexus_endpoint`

Maps from a `.twf` `nexus endpoint` block. The endpoint's `worker_target` is the `.twf` endpoint's target namespace + `task_queue`; `allowed_caller_namespaces` is the access policy (**not yet in `.twf`** — ask the user which caller namespaces to trust; do not default to allow-all).

```hcl
resource "temporalcloud_nexus_endpoint" "payments_endpoint" {
  name        = "payments-endpoint"
  description = "Service: PaymentsService; Operations: ProcessPayment, GetPaymentStatus"

  worker_target = {
    namespace_id = temporalcloud_namespace.payments.id # the .twf endpoint's target namespace
    task_queue   = "payments"                          # the .twf worker_target task_queue
  }

  allowed_caller_namespaces = [
    temporalcloud_namespace.orders.id, # caller namespace(s) — the access policy
  ]
}
```

Notes:
- `name` must match `^[a-zA-Z][a-zA-Z0-9\-]*[a-zA-Z0-9]$` and is the identifier caller workflow code uses to invoke the endpoint — it must match the endpoint name in the `.twf` / `author-go` output.
- Only a single `worker_target` is supported per endpoint.
- `allowed_caller_namespaces` is the runtime access control: only listed namespaces may invoke the endpoint.

## Import + Drift Workflow (adopting existing infra)

When the resource already exists in Temporal Cloud, **import it before managing** — otherwise Terraform plans a create and you get a duplicate or an error.

1. Write an empty (or matching) resource block as the import target.
2. Import using the resource's ID:

```bash
# Namespace — ID is namespaceid.acctid (or just the namespace id, per UI)
terraform import temporalcloud_namespace.orders <namespace-id>

# Search attribute — ID is namespaceid.acctid/attrName
terraform import temporalcloud_namespace_search_attribute.order_status <namespace-id>/OrderStatus

# Nexus endpoint — ID from `tcld nexus endpoint list`
terraform import temporalcloud_nexus_endpoint.payments_endpoint <endpoint-id>
```

3. `terraform plan` — reconcile the block to match reality until the plan is clean (no changes). A non-empty plan after import means your HCL diverges from the live resource; fix the HCL, don't apply blindly.

**Drift discipline:** once imported/managed, never edit the resource in the console or via `tcld` — the next `terraform plan` will try to revert it. Terraform is the single owner. Run `terraform plan` in CI to detect drift early.

## Verify

```bash
terraform init
terraform plan   # review the diff; an unexpected "create" on a resource that should exist means a missing import
terraform apply
```

Confirm the provisioned task queue names match what `author-go`'s workers register on — a mismatch means Nexus tasks route nowhere.
