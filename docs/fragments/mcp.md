---
description: "The twf MCP server: parser tools + the embedded language spec, over stdio, for any MCP client."
---
## Use as an MCP server

`twf mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio — the agent entry point. Point any MCP client (Claude Desktop, Cursor, Continue, Windsurf, Zed) at it:

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

The tools (`twf_check`, `twf_parse`, `twf_symbols`, `twf_graph`, `twf_graph_chunks`, `twf_spec_list`, `twf_spec_get`) are thin wrappers over the same parser pipeline as the CLI, so their JSON is identical. The embedded language specification is exposed as resources at `twf://spec` and `twf://spec/<slug>`.
