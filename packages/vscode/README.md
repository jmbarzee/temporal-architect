# Temporal Architect

Design, visualize, and implement entire Temporal systems — namespaces, workers, workflows, and Nexus — as a validated, visual source of truth. `.twf` is the artifact; `twf` is the deterministic harness that gives your AI compiler-grade feedback at system scale.

This is the architecture layer above SDK codegen: a parseable model of your whole deployment, validated by a real parser and language server and rendered as an interactive architecture graph — not a per-workflow assist.

<!-- [SCREENSHOT: S1 — Graph View, full system (namespace→worker→workflow) with dependency edges] → images/graph-view-system.png -->
<!-- [SCREENSHOT: S3 — Graph View, dark theme, in the VS Code/Cursor webview with the editor beside it] → images/graph-view-webview.png -->
<!-- [SCREENSHOT: S4 — Live diagnostics: red squiggle + hover on an undefined activity] → images/diagnostics.png -->

## Features

### Language Server

Full language server with real-time diagnostics:

- **Parse & resolve errors** — undefined activities, duplicate definitions, temporal keywords in wrong context
- **Symbol resolution** — activity calls, workflow calls, signals, queries, updates, promises, and conditions are all cross-referenced
- **Syntax highlighting** — keywords, types, operators, durations, and comments
- **Bracket matching and code folding**
- **Completions, hover, go-to-definition, references, and rename**

### Workflow Visualizer

Interactive visualization of `.twf` files, accessible from the editor title bar or command palette:

- **Visualize file** — parses the current `.twf` file and renders workflows, activities, and their relationships
- **Visualize folder** — renders all workflows across multiple `.twf` files in a folder
- **Live refresh** — updates automatically when you save a `.twf` file
- **Focused view** — follows the active editor, highlighting the workflows defined in the current file

Two complementary views:

- **Tree View** — Every definition rendered as a collapsible, color-coded block. Expand a workflow call to see the target workflow's body inline. Filter by file, definition type, or search by name.
- **Graph View** — A force-directed graph showing relationships across namespaces, workers, and workflows. Semantic zoom lets you switch between abstraction levels. Interactive force-tuning controls and animated transitions.

### System-Design Skills

Installs the `temporal-architect` skills for Cursor's AI agent — a deterministic harness that lets the agent reason at system scale instead of code scale:

- **Design** — guides the agent through designing entire systems (workflows, activities, workers, namespaces, Nexus) with proper determinism, idempotency, and decomposition
- **Go authoring** — translates `.twf` designs into Temporal Go SDK code
- **Infra provisioning** — provisions the control-plane resources a design needs (namespaces, Nexus endpoints, search attributes) via the Temporal Cloud Terraform provider or self-hosted `tcld` / `temporal operator`

### `twf` CLI

The bundled `twf` binary is also available as a standalone CLI:

| Command | Description |
|---------|-------------|
| `twf check <file...>` | Parse and validate `.twf` files |
| `twf parse <file...>` | Output the AST as JSON |
| `twf symbols <file...>` | List workflows and activities with signatures |
| `twf graph <file...>` | Emit the resolved deployment graph |
| `twf graph --history <dir>` | Recover a deployment graph from sampled production histories (no `.twf` required) |
| `twf lsp` | Start the language server (stdio) |

`twf graph --history` reconstructs a deterministic deployment graph straight from a tree of sampled production workflow histories — the harness reads a *running* system, not just a design. The `tools/sampler/` collector pulls a representative sample from a live namespace into the layout it consumes.

## Temporal Features

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

## Installation

Search for **"Temporal Architect"** in the VS Code or Cursor extension marketplace.

The extension bundles the `twf` binary (language server + parser). No additional setup required.

## Commands

| Command | Description |
|---------|-------------|
| **TWF: Visualize Workflow** | Open the interactive visualizer for the current `.twf` file |
| **TWF: Visualize All Workflows in Folder** | Visualize all `.twf` files in a folder |
| **Temporal Architect: Install Skills** | Re-install the system-design skills to `~/.cursor/skills/` |

## License

MIT
