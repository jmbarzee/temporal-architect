# CLI Provisioning (`tcld` / `temporal operator`)

The imperative alternative to Terraform. Two distinct CLIs cover two deployment targets:

| CLI | Target | Use when |
|-----|--------|----------|
| `tcld` | **Temporal Cloud** | You want imperative Cloud provisioning without committing to Terraform state. |
| `temporal operator` | **Self-hosted** OSS cluster | There is no Cloud account — you run your own `temporal server`. |

Prefer [Terraform](./terraform.md) for Temporal Cloud when the project keeps IaC in state; reach for `tcld` for one-off or scripted Cloud changes. For self-hosted there is no Terraform provider, so `temporal operator` is the path.

Whichever CLI: **make the runbook idempotent** — guard every `create` with a `list`/`get` so re-running is safe, and commit the runbook rather than leaving provisioning as an untracked transcript.

---

## Namespaces

**Temporal Cloud (`tcld`):**

```bash
tcld namespace create \
  --namespace orders \
  --region aws-us-east-1 \
  --retention-days 14 \
  --auth-method api_key
```

**Self-hosted (`temporal operator`):**

```bash
temporal operator namespace create \
  --namespace orders \
  --retention 14d
```

Self-hosted namespaces have no region/auth-method flags — those are Cloud concerns. Retention is `--retention` with a duration (`14d`).

## Custom Search Attributes

**Not yet modeled in `.twf`** — ask the user for the name and type (see SKILL.md → Not-Yet-Modeled Intent).

**Self-hosted (`temporal operator`):**

```bash
temporal operator search-attribute create \
  --namespace orders \
  --name OrderStatus \
  --type Keyword   # Bool | Datetime | Double | Int | Keyword | KeywordList | Text
```

**Temporal Cloud:** register via `tcld namespace` configuration or the operator API for the Cloud namespace; the type set is the same.

## Nexus Endpoints

Maps from a `.twf` `nexus endpoint` block. `--target-namespace` + `--target-task-queue` are the endpoint's `worker_target`; `--allow-namespace` is the access policy (**not yet in `.twf`** — ask the user which caller namespaces to trust; do not default to allow-all).

**Temporal Cloud (`tcld`):**

```bash
# Guard, then create.
tcld nexus endpoint list
tcld nexus endpoint create \
  --name payments-endpoint \
  --target-namespace payments.<acct> \
  --target-task-queue payments \
  --allow-namespace orders.<acct>
```

Manage the access policy after creation:

```bash
tcld nexus endpoint allowed-namespace list  --name payments-endpoint
tcld nexus endpoint allowed-namespace add   --name payments-endpoint --namespace orders.<acct>
tcld nexus endpoint allowed-namespace set   --name payments-endpoint --namespace orders.<acct>   # replaces the full set
```

`create` fails if an endpoint of the same name already exists — hence the `list` guard. Use `tcld nexus endpoint update` to change an existing endpoint's target.

**Self-hosted (`temporal operator`):**

```bash
temporal operator nexus endpoint create \
  --name payments-endpoint \
  --target-namespace payments \
  --target-task-queue payments
```

Notes:
- The endpoint `--name` is the identifier caller workflow code uses to invoke the endpoint — it must match the endpoint name in the `.twf` / `author-go` output.
- The target task queue must match the queue `author-go`'s handler worker polls, or Nexus tasks route nowhere.

---

## Verify

```bash
# Cloud
tcld namespace get --namespace orders
tcld nexus endpoint get --name payments-endpoint

# Self-hosted
temporal operator namespace describe --namespace orders
temporal operator nexus endpoint get --name payments-endpoint
```

Confirm each resource exists and its target task queue matches what the workers register on.

---

## Future: `helm.md`

Self-hosted **worker deployment** (k8s Helm chart) is a natural future variant — a separate reference + one routing row in SKILL.md. It is worker runtime, distinct from the control-plane resources this file provisions.
