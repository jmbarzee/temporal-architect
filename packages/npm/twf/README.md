# @temporal-architect/twf

The `twf` CLI as an npm package — parses, validates, and serves Language
Server / MCP protocols for Temporal Workflow Format (`.twf`) files.

This is a thin Node shim around platform-specific binaries published as
`@temporal-architect/twf-<platform>` optional dependencies. npm installs only
the binary for the current OS/arch.

## Install

```bash
npm install -g @temporal-architect/twf
twf --help
```

Or zero-install via `npx`:

```bash
npx -y @temporal-architect/twf check workflows.twf
```

## Use as an MCP server

In your MCP client config (Claude Desktop, Cursor MCP, Continue, Windsurf, Zed):

```json
{
  "mcpServers": {
    "twf": {
      "command": "npx",
      "args": ["-y", "@temporal-architect/twf", "mcp"]
    }
  }
}
```

The `mcp` subcommand exposes `twf check`, `parse`, `symbols`, `spec`, and
embedded skills as MCP tools/resources/prompts.

## Supported platforms

| Platform | Package |
|---|---|
| macOS arm64 (Apple Silicon) | `@temporal-architect/twf-darwin-arm64` |
| macOS x64 (Intel)           | `@temporal-architect/twf-darwin-x64` |
| Linux x64                   | `@temporal-architect/twf-linux-x64` |
| Linux arm64                 | `@temporal-architect/twf-linux-arm64` |
| Windows x64                 | `@temporal-architect/twf-win32-x64` |

## Troubleshooting

**`@temporal-architect/twf: <pkg> not installed`** — npm skipped the optional
dependency. Reinstall without `--no-optional` or `--omit=optional`:

```bash
npm install --include=optional @temporal-architect/twf
```

**Unsupported platform** — if your OS/arch isn't in the table above, file
an issue at [github.com/jmbarzee/temporal-architect/issues](https://github.com/jmbarzee/temporal-architect/issues).

## Versioning

Versions are synced to the upstream `temporal-architect` Git tag, so `0.3.x`
of this package corresponds to `v0.3.x` of the toolchain.

## License

MIT. See [LICENSE](https://github.com/jmbarzee/temporal-architect/blob/main/LICENSE).
