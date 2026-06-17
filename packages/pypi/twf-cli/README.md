# twf-cli

The `twf` CLI for Python projects — design and validate **entire Temporal
systems** in `.twf`, emit the deployment graph, and serve Language Server /
MCP protocols. A thin wrapper around the bundled platform binary: same tool,
same flags, same output as the standalone `twf` distribution, installable via
`pip`. See the [project README](https://github.com/jmbarzee/temporal-architect)
for the full picture (visualizer, skills, examples).

## Install

```bash
pip install twf-cli
twf --help
```

The wheel for your platform ships the matching `twf` binary. Supported
platforms (one wheel each):

| Platform | Wheel tag |
|---|---|
| macOS arm64 (Apple Silicon) | `macosx_11_0_arm64` |
| macOS x64 (Intel)           | `macosx_10_15_x86_64` |
| Linux x64                   | `manylinux2014_x86_64` |
| Linux arm64                 | `manylinux2014_aarch64` |
| Windows x64                 | `win_amd64` |

## Use as an MCP server

Once installed:

```json
{
  "mcpServers": {
    "twf": {
      "command": "twf",
      "args": ["mcp"]
    }
  }
}
```

Works in any MCP-compatible client (Claude Desktop, Cursor MCP,
Continue, Windsurf, Zed). See the
[main project README](https://github.com/jmbarzee/temporal-architect) for
the full MCP feature surface.

## Subprocess use from Python

```python
import subprocess
import json

result = subprocess.run(
    ["twf", "parse", "workflow.twf"],
    capture_output=True,
    text=True,
    check=True,
)
ast = json.loads(result.stdout)
```

## Versioning

Versions are synced to the upstream `temporal-architect` Git tag, so `0.3.x`
of this package corresponds to `v0.3.x` of the toolchain.

## License

MIT. See [LICENSE](https://github.com/jmbarzee/temporal-architect/blob/main/LICENSE).
