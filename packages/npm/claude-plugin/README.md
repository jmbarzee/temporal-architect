# @temporal-skills/claude-plugin

The skills payload for the [temporal-skills Claude Code plugin](https://github.com/jmbarzee/temporal-skills).

You almost certainly don't want to install this directly. It's the npm-side
delivery vehicle that Claude Code's marketplace mechanism pulls from when a
user installs the `temporal-skills` plugin.

## Install (the user-facing way)

```text
/plugin marketplace add jmbarzee/temporal-skills
/plugin install temporal-skills@temporal-skills
```

Bundles:

- **Skills** — `temporal-workflow-design` and `temporal-go-author`, available
  to Claude as auto-discoverable agent skills.
- **MCP server** — the `twf` MCP server (via `npx -y @temporal-skills/twf mcp`),
  exposing TWF parser tools, embedded spec resources, and skill prompts.

The plugin definition itself lives in
[`.claude-plugin/marketplace.json`](https://github.com/jmbarzee/temporal-skills/blob/main/.claude-plugin/marketplace.json)
at the repo root and uses `strict: false` to declare components inline. This
npm package contributes only the `skills/` payload.

## Source of truth

The skills shipped here are a build-time copy of the canonical
[`skills/`](https://github.com/jmbarzee/temporal-skills/tree/main/skills) at
the repo root. Edit there, then `make build-claude-plugin` regenerates the
copy. The copy is gitignored — it only exists in this directory after a
local build or during npm publish.

## License

MIT — see the bundled `LICENSE` (copied from the repo root at pack time).
