# Workflow ID Schemes

> **Example:** [`workflow-id-schemes.twf`](./workflow-id-schemes.twf) · grammar: `twf spec workflows`, `twf spec cross-workflow-signals`

## When a Type Needs a Scheme

Give a workflow type an `id_scheme:` only when its ID must be **reconstructed later** — by a sender that did not start it, a starter that retries, or a client. A Nexus run operation's backing workflow always needs one: its start request may be retried (`NEXUS_RUN_WITHOUT_ID_SCHEME`). Most other types need none: a handle or the parent reconstructs nothing.

- Build the scheme from business keys (`"ship-{order.id}-{item.id}"`), so each start is idempotent and two entities never share an ID. A scheme with no holes is a singleton.
- A type whose ID needs data its input lacks gets no scheme: add the key to the input.
- `close continue_as_new(...)` must pass the same values for the scheme's roots, or the next run answers to a different ID (`UserEntity` in [long-running.twf](./long-running.twf)).
- `ID_SCHEME_OVERLAP` means two schemes in one namespace could mint the same ID; make their fixed prefixes distinct.

## Start Collisions

A scheme makes starts with the same inputs collide on one ID; two policies decide what a collision means. Set them in the type's `default_options:`, so every starter — including client code outside the design — agrees.

| Intent | `workflow_id_conflict_policy` (ID is *running*) | `workflow_id_reuse_policy` (ID is *closed*) |
|--------|-----------------------------|--------------------------|
| One running at a time; later starts run again (Temporal's default) | `FAIL` | `ALLOW_DUPLICATE` |
| Entity or lazy start: every starter joins the running one | `USE_EXISTING` | `ALLOW_DUPLICATE` |
| At most once per key, within namespace retention | `USE_EXISTING` or `FAIL` | `REJECT_DUPLICATE` |
| Re-run only after an unsuccessful close (failed, terminated, cancelled, timed out) | `FAIL` or `USE_EXISTING` | `ALLOW_DUPLICATE_FAILED_ONLY` |
| Latest wins: a new start replaces the running one | `TERMINATE_EXISTING` | `ALLOW_DUPLICATE` |

- **Child starts cannot carry a conflict policy.** A child start onto a running ID fails; it cannot join or replace (`CHILD_START_CONFLICT_MISMATCH` hints when the type defaults to either). A client start — a sync nexus body or an `async` op — follows the default; a sync-body start may override it.
- Clients that signal-with-start need `USE_EXISTING` or `TERMINATE_EXISTING` (Temporal rejects `FAIL`); clients that update-with-start need a policy, and under `FAIL` the update fails while the workflow runs.
- A Nexus run op under `USE_EXISTING` attaches its caller to the running workflow (server 1.27+).
- `TERMINATE_EXISTING` with `REJECT_DUPLICATE` is rejected by Temporal (server 1.27+) — `ID_POLICY_INCOMPATIBLE`. `TERMINATE_EXISTING` restarts are throttled (about one per second per ID).
- A policy on a type with no scheme acts on no start in the design (`ID_POLICY_WITHOUT_ID_SCHEME`): declare the scheme. A constant scheme suits a singleton.
- Temporal's deprecated `TERMINATE_IF_RUNNING` is not `.twf`: write `ALLOW_DUPLICATE` + `TERMINATE_EXISTING`.

## Addressing a Send

A send to a workflow the sender holds no handle to names the type and an `id:`:

| `id:` | Use when | Example |
|-------|----------|---------|
| Constructed literal | The sender holds the scheme's keys under its own names | `RelayCarrierEvent` |
| Learned name | The sender was handed the whole ID (activity result, payload) | `RedeliverTracking` |
| `parent` | A child reports to the workflow that started it | `ShipItem` |

- **A bare name is the whole ID.** Under `"transfer-{req.key}"`, `id: key` sends to `key`, not `transfer-key`; nothing detects it. To build the ID from a key, write the literal.
- `run_id:` pins one run, only when the sender learned it; without it the signal reaches the current run.
- **The head is a claim, not the address.** Temporal delivers by ID alone; the type only selects the scheme, the handler, and the graph edge. A wrong type with a right ID still delivers.
- `id: parent` asserts every starter is that type. `NOT_A_PARENT` warns when the type never starts the sender; `STARTER_LACKS_SIGNAL` warns when another starter does not declare the signal — the child would signal a parent that cannot receive it.
