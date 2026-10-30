# Workflow ID Schemes

> **Example:** [`workflow-id-schemes.twf`](./workflow-id-schemes.twf) · grammar: `twf spec workflows`, `twf spec cross-workflow-signals`

## When a Type Needs a Scheme

Give a workflow type an `id_scheme:` only when its ID must be **reconstructed later** — by a sender that did not start it, a starter that retries, or a client. Most types need none: a handle or the parent reconstructs nothing.

- Build the scheme from business keys (`"ship-{order.id}-{item.id}"`), so each start is idempotent and two entities never share an ID. A scheme with no holes is a singleton.
- A type whose ID needs data its input lacks gets no scheme: add the key to the input.
- `close continue_as_new(...)` must pass the same values for the scheme's roots, or the next run answers to a different ID (`UserEntity` in [long-running.twf](./long-running.twf)).
- `ID_SCHEME_OVERLAP` means two schemes in one namespace could mint the same ID; make their fixed prefixes distinct.

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
