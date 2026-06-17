# Temporal Architect

**Design, visualize, and implement entire Temporal systems — namespaces, workers, workflows, and Nexus — without leaving your editor.**

Write your architecture in `.twf` and get live validation, an interactive architecture graph, and AI skills that turn the design into Temporal Go SDK code and infra. The architecture layer above SDK codegen — a parseable model of your whole deployment, not a per-workflow assist.

<!-- [SCREENSHOT: S1 — Graph View, full system (namespace→worker→workflow) with dependency edges] → images/graph-view-system.png -->
<!-- [SCREENSHOT: S3 — Graph View, dark theme, in the VS Code/Cursor webview with the editor beside it] → images/graph-view-webview.png -->
<!-- [SCREENSHOT: S4 — Live diagnostics: red squiggle + hover on an undefined activity] → images/diagnostics.png -->

## What you get

- **Live diagnostics** — undefined activities, broken references, duplicate definitions, and determinism traps flagged as you type, plus completions, hover, go-to-definition, references, and rename.
- **Interactive visualizer** — open any `.twf` file as a **Graph View** (namespace → worker → workflow topology with dependency edges) or a **Tree View** (collapsible blocks; expand a call to see the target's body inline). From the editor title bar or command palette.
- **System-design skills** — auto-installed for Cursor's AI agent: **Design** (model the whole system), **Go authoring** (generate Temporal Go SDK code), and **Infra provisioning** (namespaces, Nexus endpoints, search attributes via Terraform / `tcld`).
- **Bundled `twf` CLI** — the same parser/LSP binary on your PATH, including `twf graph --history <dir>` to recover a deployment graph straight from sampled production histories.

## What `.twf` looks like

```twf
activity ReserveFunds(amount: Money) -> (Hold):
    reserve(amount)

activity CaptureFunds(hold: Hold) -> (Receipt):
    capture(hold)

workflow ChargeOrder(order: Order) -> (Receipt):
    signal Cancel():
        close fail("cancelled")

    activity ReserveFunds(order.amount) -> hold
        options:
            start_to_close_timeout: 30s
    activity CaptureFunds(hold) -> receipt
    close complete(receipt)

worker billing:
    workflow ChargeOrder
    activity ReserveFunds
    activity CaptureFunds

namespace payments:
    worker billing
        options:
            task_queue: "billing"
```

## Install

Search for **"Temporal Architect"** in the VS Code or Cursor extension marketplace. The extension bundles the `twf` binary (language server + parser) — no additional setup required.

## Commands

| Command | Description |
|---------|-------------|
| **TWF: Visualize Workflow** | Open the interactive visualizer for the current `.twf` file |
| **TWF: Visualize All Workflows in Folder** | Visualize all `.twf` files in a folder |
| **Temporal Architect: Install Skills** | Re-install the system-design skills to `~/.cursor/skills/` |

The bundled `twf` CLI also runs standalone: `twf check`, `twf parse`, `twf symbols`, `twf graph [--history <dir>]`, `twf lsp`. Run `twf --help` for the full surface.

<details>
<summary><strong>Full Temporal feature coverage</strong></summary>

The TWF notation covers the core Temporal feature set:

| Feature | TWF Construct | Purpose |
|---------|---------------|---------|
| Namespaces | `namespace` | Define deployment topology — workers and nexus endpoints |
| Workers | `worker` | Group workflows, activities, and nexus services into deployment units |
| Workflows | `workflow` (definition) | Deterministic orchestration with signals, queries, and updates |
| Activities | `activity` | Side-effecting operations with retry and timeout options |
| Child Workflows | `workflow` (call) | Decompose into independent sub-workflows |
| Signals | `signal` | Async fire-and-forget input to a running workflow |
| Queries | `query` | Synchronous read of workflow state |
| Updates | `update` | Synchronous mutation with a return value |
| Timers | `timer` | Durable sleep that survives restarts |
| Promises | `promise` | Non-blocking async operations, awaited later |
| Conditions | `condition` / `set` / `unset` | Named boolean awaitables for coordination |
| Fan-out / Fan-in | `await all` | Run operations concurrently, wait for all |
| Racing / Select | `await one` | Race between signals, timers, activities, and more |
| Control Flow | `if` / `for` / `switch` | Conditional logic, iteration, and branching |
| Detach | `detach workflow` / `detach nexus` | Fire-and-forget child workflows or nexus calls |
| Nexus Services | `nexus service` | Define sync and async service operation APIs |
| Nexus Endpoints | `nexus endpoint` | Route cross-namespace calls to workers within a namespace |
| Nexus Calls | `nexus` | Invoke operations across namespace boundaries |
| Continue-as-New | `close continue_as_new` | Reset history for long-running workflows |
| Heartbeats | `heartbeat` | Report activity progress, detect worker death |
| Options | `options:` | Task queues, timeouts, retry policies, priority |
| Workflow Termination | `close complete` / `close fail` | Explicit workflow exit with status |

</details>

## License

MIT
