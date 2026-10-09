# CLI Provisioning (`tcld` / `temporal operator`)

- **`tcld`** — Temporal Cloud, for one-off or scripted changes. Prefer [Terraform](./terraform.md) when the project keeps IaC in state.
- **`temporal operator`** — a self-hosted cluster. There is no Terraform provider, so this is the path.

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

Name and type come from the user ([not in `.twf`](../SKILL.md#not-yet-modeled-in-twf)).

**Self-hosted (`temporal operator`):**

```bash
temporal operator search-attribute create \
  --namespace orders \
  --name OrderStatus \
  --type Keyword   # Bool | Datetime | Double | Int | Keyword | KeywordList | Text
```

**Temporal Cloud:** the same flags and types under `temporal cloud namespace search-attribute create`; guard with `temporal cloud namespace search-attribute list --namespace <ns>`.

## Nexus Endpoints

`--target-namespace` + `--target-task-queue` are the `.twf` endpoint's `worker_target`; `--allow-namespace` is the access policy ([not in `.twf`](../SKILL.md#not-yet-modeled-in-twf)).

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

## Verify

```bash
# Cloud
tcld namespace get --namespace orders
tcld nexus endpoint get --name payments-endpoint

# Self-hosted
temporal operator namespace describe --namespace orders
temporal operator nexus endpoint get --name payments-endpoint
```
