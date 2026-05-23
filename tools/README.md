# tools/

**Source for binaries and libraries that ship.** Each module here is
consumed by users of the project, either directly (e.g. `tools/spec`
imported as a Go module) or after compilation/packaging (e.g.
`tools/lsp` → `twf` binary).

For the *packaged artifacts* that result, see [`packages/`](../packages/).
For the [`internal/`](../internal/) tree, that's everything dev-only —
release tooling, the dev-cycle orchestrator, helper scripts.

## Modules

| Path | Ships as | Contract |
|---|---|---|
| [`spec/`](./spec/) | Embedded markdown sections + Go module `github.com/jmbarzee/temporal-skills/tools/spec` | DSL grammar — single source of truth |
| [`lsp/`](./lsp/) | `twf` binary (LSP server, parser, validator, CLI) | Token types, AST node types, resolver error model, `twf parse`/`symbols`/`check` JSON |
| [`visualizer/`](./visualizer/) | `@temporal-skills/visualizer` npm package + VSIX webview | Consumes the LSP's parser-output JSON |

## Conventions

Each top-level directory is its own self-contained module with its own
build, test, and dependency declarations:

- Go modules (`spec/`, `lsp/`) wired into [`go.work`](../go.work).
- TypeScript packages (`visualizer/`) with their own `package.json`
  and `node_modules`.

Dependencies between modules flow downstream-only — `spec` is consumed
by `lsp`, `lsp`'s parser-output JSON is consumed by `visualizer`. See
[`AGENTS.md` § Dependency Map](../AGENTS.md) for the full graph.
