---
description: "The twf CLI + language server: parse, validate, and emit the deployment graph of an entire Temporal system in .twf."
---
## The `twf` CLI

A single Go binary: parser, validator, deployment-graph extractor, and a full LSP server. Every command and flag is discoverable via `twf --help` and `twf <command> --help`.

| Command | Description |
|---------|-------------|
| `twf check <file...>` | Parse and validate `.twf` files, reporting errors |
| `twf parse <file...>` | Output the AST as JSON (partial AST even with errors) |
| `twf symbols <file...>` | List workflows and activities with their signatures |
| `twf graph <file...>` | Emit the resolved deployment graph (nodes are deployments, edges are dispatches) |
| `twf graph chunks <file...>` | Decompose a design into independently-implementable chunks at contract boundaries |
| `twf spec [--list \| <slug>]` | Print the embedded TWF language specification |
| `twf mcp` | Start the MCP server over stdio (agent entry point) |
| `twf lsp` | Start the language server over stdio |

Common options: `--json` (structured output) and `--lenient` (continue past resolve errors). The language server adds real-time diagnostics, completions, hover, go-to-definition, references, rename, code actions, folding, inlay hints, semantic tokens, and signature help.
