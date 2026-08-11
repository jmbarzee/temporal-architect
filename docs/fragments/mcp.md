---
description: "The twf MCP server: parser tools + the embedded language spec, over stdio, for any MCP client."
---
## Use as an MCP server

`twf mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio — the agent entry point. The examples below launch it through `npx`, so Node.js and npm must be installed and `npx` must be available on `PATH`.

### Claude Desktop

Add the `twf` entry to the existing `mcpServers` object in the [Claude Desktop configuration file](https://modelcontextprotocol.io/docs/develop/connect-local-servers):

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

Restart Claude Desktop after saving the file.

### Cursor

Create `.cursor/mcp.json` in a project to enable `twf` for that project, or use `~/.cursor/mcp.json` to enable it globally. Both locations use the same [Cursor MCP configuration shape](https://cursor.com/docs/context/mcp):

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

### Continue

Create `.continue/mcpServers/twf.yaml` at the top level of the workspace. Continue's [standalone MCP blocks](https://docs.continue.dev/customize/deep-dives/mcp) require the `name`, `version`, and `schema` metadata fields:

```yaml
name: TWF MCP server
version: 0.0.1
schema: v1
mcpServers:
  - name: twf
    command: npx
    args:
      - "-y"
      - "@temporal-architect/twf"
      - "mcp"
```

The tools (`twf_check`, `twf_parse`, `twf_symbols`, `twf_graph`, `twf_graph_chunks`, `twf_spec_list`, `twf_spec_get`) are thin wrappers over the same parser pipeline as the CLI, so their JSON is identical. The embedded language specification is exposed as resources at `twf://spec` and `twf://spec/<slug>`.
