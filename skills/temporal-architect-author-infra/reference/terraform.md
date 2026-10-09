# Temporal Cloud + Terraform (`temporalio/temporalcloud`)

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

One resource per custom search attribute; name and type come from the user ([not in `.twf`](../SKILL.md#not-yet-modeled-in-twf)).

```hcl
resource "temporalcloud_namespace_search_attribute" "order_status" {
  namespace_id = temporalcloud_namespace.orders.id
  name         = "OrderStatus"
  type         = "Keyword" # one of: Bool, Datetime, Double, Int, Keyword, KeywordList, Text (case-insensitive)
}
```

## `temporalcloud_nexus_endpoint`

`allowed_caller_namespaces` is the runtime access policy — only listed namespaces may invoke the endpoint ([not in `.twf`](../SKILL.md#not-yet-modeled-in-twf)).

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

`name` must match `^[a-zA-Z][a-zA-Z0-9\-]*[a-zA-Z0-9]$`. An endpoint supports only one `worker_target`.

## Import existing resources

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

Once imported, console or `tcld` edits are drift the next `plan` reverts; run `terraform plan` in CI to catch it early. An unexpected `create` in any `plan` on a resource that should already exist means a missing import.
