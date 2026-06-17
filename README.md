# temporal-architect

Design, visualize, and implement entire Temporal systems — namespaces, workers, workflows, and Nexus — as a validated, visual source of truth. `.twf` is the artifact; `twf` is the deterministic harness that gives your AI compiler-grade feedback at system scale.

`temporal-architect` is the architecture layer above SDK codegen. It extends the complexity horizon of AI-assisted development: instead of working at code scale — error handling, library choices, SDK pedantics — an agent works at *system* scale, reasoning about deployment topology, scaling, reliability, and availability against a parseable model the `twf` parser and language server validate. The deployment graph can be built from your `.twf` source of truth *or* recovered straight from production history (`twf graph --history`), so the harness reads a *running* system, not just a design.

<!-- [SCREENSHOT: S1 — Graph View, full system, namespace→worker→workflow with dependency edges] → docs/images/graph-view-system.png -->
<!-- [SCREENSHOT: S2 — Tree View, one workflow expanded with inline call expansion] → docs/images/tree-view-expanded.png -->

The `twf` CLI is self-documenting — every command and flag is discoverable via `twf --help` and `twf <command> --help`, so the agent never guesses at the harness surface.

## Quick install

Pick the install line for your environment:

| Audience / tool | Install |
|---|---|
| **Cursor / VS Code** | Install **Temporal Architect** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jmbarzee.twf-syntax) or [Open VSX](https://open-vsx.org/extension/jmbarzee/twf-syntax). Bundles the `twf` binary, the system-design skills (auto-installed to `~/.cursor/skills/`), and the architecture visualizer. |
| **Claude Code** | `/plugin marketplace add jmbarzee/temporal-architect` then `/plugin install temporal-architect@temporal-architect`. Bundles the design, Go-authoring, and infra-provisioning skills plus the `twf` MCP server. |
| **Any MCP-compatible client** (Claude Desktop, Cursor MCP, Continue, Windsurf, Zed) | Add to your MCP client config: `{"twf": {"command": "npx", "args": ["-y", "@temporal-architect/twf", "mcp"]}}` |
| **Node / JS / TS projects** | `npx -y @temporal-architect/twf check workflows.twf` (zero-install) or `npm install -g @temporal-architect/twf`. |
| **Python projects** | `pip install twf-cli` |
| **Homebrew** (macOS / Linux) | `brew install jmbarzee/twf/twf` |
| **Direct binary** | `curl -sSL https://github.com/jmbarzee/temporal-architect/releases/latest/download/install.sh \| bash` |
| **Go projects** | `go install github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf@latest` |

All install paths converge on the same `twf` binary and the same embedded skills + spec.

## Tools

### `twf` CLI — Parser & Language Server

A Go binary providing parsing, validation, symbol extraction, and a full LSP server.

| Command | Description |
|---------|-------------|
| `twf check <file...>` | Parse and validate `.twf` files, reporting errors |
| `twf parse <file...>` | Output the AST as JSON (always emits partial AST, even with errors) |
| `twf symbols <file...>` | List workflows and activities with their signatures |
| `twf graph <file...>` | Emit the resolved deployment graph (nodes are deployments, edges are dispatches) |
| `twf graph --history <dir>` | Recover a deployment graph straight from sampled production histories — no `.twf` required |
| `twf spec [--list \| <slug>]` | Print the embedded TWF language specification |
| `twf lsp` | Start the language server over stdio |

Options: `--json` (JSON output where applicable), `--lenient` (continue past resolve errors).

**Graph from production history.** `twf graph --history <dir>` reconstructs a deterministic deployment graph directly from a tree of sampled workflow histories — the harness reads a *running* system, not just a design. The [`tools/sampler/`](./tools/sampler/) collector pulls a representative sample from a live Temporal namespace into the layout `--history` consumes. This is the seed of the **observed-vs-designed overlay**: diff a history-derived graph against a `.twf`-derived one to surface drift between design and production.

<!-- [SCREENSHOT: S7 — Graph View rendered from sampled history, beside the same system's .twf-designed graph] → docs/images/graph-view-history.png -->

The language server provides real-time diagnostics, symbol resolution, completions, hover, go-to-definition, references, rename, code actions, folding, inlay hints, semantic tokens, and signature help.

### Architecture Visualizer

A React + TypeScript webview (Vite-built) that renders the system architecture defined in `.twf` — namespaces, workers, workflows, and Nexus. Runs standalone for development or embedded in the VS Code extension.

**[Tree View](./tools/visualizer/spec/TREE_VIEW.md)** — Renders every definition as a collapsible, color-coded block in a vertical list. Supports inline expansion of cross-references (a workflow call expands to show the target workflow's body in place), file filtering, definition type toggles, and search. Full light/dark theme support.

**[Graph View](./tools/visualizer/spec/GRAPH_VIEW.md)** — A force-directed graph showing how definitions relate to each other. Three node levels (Namespace → Worker → Workflow) form a containment hierarchy with dependency edges derived by graph coarsening. Semantic zoom lets you select which abstraction levels are visible. Includes interactive force-tuning controls, animated level transitions, and hover/selection highlighting.

### Agent vs. human surfaces

The skills assume `twf` is **on PATH** (the VS Code/Cursor extension symlinks the bundled binary into a PATH dir on activation; otherwise install via any [Quick install](#quick-install) line). An AI agent reads graph data through `twf graph --json` — a structured, deterministic surface it drives directly. The **visualizer GUI stays human-facing**, opened via the `twf.visualize` editor command; it is not a CLI the agent drives. Keeping the agent on the JSON surface and out of "where is the tool" busywork is exactly the context-protection the project is built on.

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

## Skills

- **[temporal-architect-design](./skills/temporal-architect-design/SKILL.md)** — Design entire Temporal systems in `.twf` — workflows, activities, workers, namespaces, and Nexus — with parser/LSP validation and visualization
- **[temporal-architect-author-go](./skills/temporal-architect-author-go/SKILL.md)** — Generate Go code from `.twf` designs using the Temporal Go SDK
- **[temporal-architect-author-infra](./skills/temporal-architect-author-infra/SKILL.md)** — Provision the control-plane resources a `.twf` design needs — namespaces, Nexus endpoints, search attributes — via the Temporal Cloud Terraform provider or self-hosted `tcld` / `temporal operator`

### Planned

- **More implementers** — Additional authorship skills beyond Go and infra (TypeScript, Python, Java, etc.)
- **Translators** — Analyze existing systems (event-based architectures, SQS/Lambda, etc.) and generate equivalent `.twf` designs
- **Debuggers & Optimizers** — Assist with debugging, profiling, and optimizing existing Temporal systems

## Packaging & Distribution

Every way `twf` and the skills ship — the canonical channel matrix. For user-facing install lines, see [Quick install](#quick-install) above; for design rationale, see [`packaging.md`](./packaging.md); for the actionable rollout work, see [`publishing_setup.md`](./publishing_setup.md).

| Channel | Artifact | Install | Bundles | Source |
|---|---|---|---|---|
| **VS Code Marketplace** / **Open VSX** | `jmbarzee.twf-syntax` (VSIX, 5 platforms) | Search "Temporal Architect" in Extensions, or install from [Marketplace](https://marketplace.visualstudio.com/items?itemName=jmbarzee.twf-syntax) / [Open VSX](https://open-vsx.org/extension/jmbarzee/twf-syntax) | `twf` binary, LSP client, visualizer webview, skills (auto-installed to `~/.cursor/skills/` on activation) | [`packages/vscode/`](./packages/vscode/) |
| **Claude Code marketplace** | `@temporal-architect/claude-plugin` (payload) | `/plugin marketplace add jmbarzee/temporal-architect` → `/plugin install temporal-architect@temporal-architect` | skills tree + plugin manifest declaring the `twf` MCP server | catalog at [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json); payload built from [`packages/npm/claude-plugin/`](./packages/npm/claude-plugin/) |
| **npm (wrapper + platform sub-packages)** | `@temporal-architect/twf` + `@temporal-architect/twf-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64}` | `npx -y @temporal-architect/twf check workflows.twf` (zero-install) or `npm i -g @temporal-architect/twf` | `twf` binary (resolved via `optionalDependencies` per platform) | [`packages/npm/twf/`](./packages/npm/twf/) wrapper + [`packages/npm/twf-*/`](./packages/npm/) sub-packages |
| **npm (visualizer)** | `@temporal-architect/visualizer` | `npm install @temporal-architect/visualizer` then `import { Visualizer } from '@temporal-architect/visualizer'` | React `<Visualizer>` component + AST/diagnostic types + sibling `styles.css` | [`tools/visualizer/`](./tools/visualizer/) (built via `vite.lib.config.ts`) |
| **PyPI** | `twf-cli` (wheel, 5 platforms) | `pip install twf-cli` | `twf` binary force-included per wheel; MCP server entrypoint | [`packages/pypi/twf-cli/`](./packages/pypi/twf-cli/) |
| **Homebrew tap** | `jmbarzee/homebrew-twf` formula `twf` | `brew install jmbarzee/twf/twf` | `twf` binary | formula auto-bumped by [`internal/release/bump-brew/`](./internal/release/bump-brew/) against the tap repo |
| **GitHub Release assets** | `twf-vX.Y.Z-<goos>-<goarch>.{tar.gz,zip}` + `skills-vX.Y.Z.tar.gz` + `SHA256SUMS` + `install.sh` | `curl -sSL https://github.com/jmbarzee/temporal-architect/releases/latest/download/install.sh \| bash` (binary only) or download individually | platform binary; `skills/` tree with `MANIFEST.json` | built by [`.github/workflows/release.yml`](./.github/workflows/release.yml) from [`tools/lsp/`](./tools/lsp/) and [`skills/`](./skills/) via [`internal/release/gen-skills-manifest/`](./internal/release/gen-skills-manifest/) |
| **Go install** | `github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf` | `go install github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf@latest` | `twf` binary (built from source by the user's Go toolchain) | [`tools/lsp/cmd/twf/`](./tools/lsp/cmd/twf/) |
| **Skill files (direct)** | files under `skills/` at any pinned ref | `git clone` / vendor / `curl -L <raw URL>` | one `SKILL.md` per skill + `reference/` + `topics/` | [`skills/temporal-architect-design/`](./skills/temporal-architect-design/), [`skills/temporal-architect-author-go/`](./skills/temporal-architect-author-go/), and [`skills/temporal-architect-author-infra/`](./skills/temporal-architect-author-infra/) |
| **MCP** (planned, M2) | `twf mcp` over stdio | configure any MCP client to launch `npx -y @temporal-architect/twf mcp` (or `twf mcp` if installed) | tools wrapping `check`/`parse`/`symbols`/`spec`/`skill`; resources for spec sections and skill files; prompts per skill | [`tools/lsp/cmd/twf/`](./tools/lsp/cmd/twf/) (subcommand to be added) |
| **Smithery MCP registry** (planned, post-M2) | listing pointing at the `twf mcp` install line | discover and install via the Smithery UI / CLI | (registry listing only — no payload) | submission only; no source in this repo |

All `twf` artifacts converge on the same binary (cross-built from `tools/lsp/`) and the same embedded language spec (`tools/spec/sections/*.md`); all skill artifacts converge on `skills/`.

## Repository Structure

The top-level layout splits **distribution** (what users receive) from **dev** (what builds and maintains it).

```
# Distribution — source of what ships
tools/
  spec/             Canonical TWF language spec (embedded markdown sections)
  lsp/              Go parser, resolver, validator, and language server (twf CLI)
  visualizer/       React workflow visualizer (tree view + graph view)
skills/             AI skill definitions (SKILL.md + reference docs)

# Distribution — packaged artifacts
packages/
  npm/              `@temporal-architect/twf` wrapper + 5 platform sub-packages
  pypi/twf-cli/     `twf-cli` PyPI wheel (one per platform)
  vscode/           VS Code / Cursor / Open VSX extension (VSIX)
  install.sh        Curl-bash installer (no package manager required)
.claude-plugin/     Claude Code marketplace plugin (root location forced by Claude Code)

# Dev — release tooling, dev-cycle orchestration, version helper
internal/
  release/          Go tools that build / sync / publish distribution artifacts
  changes/          Ephemeral coordination files for in-flight revisions
  harness/          Runner-agnostic dev-cycle prompts (agent-loop runtime)
  orchestrator/     Temporal workflow design for the automated dev cycle (durable runtime)
  version.sh        Release version bump helper

# Reference
examples/           Example `.twf` files
```

## Development

```bash
# Build everything (current platform)
make build

# Run Go tests
make test

# Package a local .vsix
make package

# Package for all platforms (CI)
make package-all

# Publish to marketplaces
VSCE_TOKEN=... OVSX_TOKEN=... make publish
```
