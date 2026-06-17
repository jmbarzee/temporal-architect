# Roadmap — engine

Toolchain (`twf` binary) feature milestones. These were tracked as part of the
packaging epic but are **engine work** — they ship in the binary built from
`tools/`. Distribution/packaging milestones (extension PATH wiring, brand rename,
docs site) live in the distribution repo's
[`packaging.md`](https://github.com/jmbarzee/temporal-architect-dist/blob/main/packaging.md).

Effort sizes: S ≈ hours, M ≈ a day.

## M1 — Self-describing binary

Embed skills in the `twf` binary and add a `twf skill` subcommand mirroring `twf spec`. Add a `compatibility:` field to each `SKILL.md` (the official Agent Skills spec field for declaring tool dependencies).

| | Work | Effort |
|---|---|---|
| 1.1 | New module `tools/skills/` with `//go:embed skills/**` and `Skills()` / `Get(name)` / `Open(name, path)`. Pattern: clone `tools/spec/spec.go`. | S |
| 1.2 | New `tools/lsp/cmd/twf/skill.go`: `twf skill`, `twf skill list`, `twf skill <name>`, `twf skill <name>/<file>`. Pattern: clone `tools/lsp/cmd/twf/spec.go`. | S |
| 1.3 | Test mirroring `tools/spec/spec_test.go`: each embedded skill has a `SKILL.md`, valid YAML frontmatter, `name` matches directory name. | S |
| 1.4 | Wire `tools/skills/` into `go.work` and `tools/lsp/go.mod` (relative `replace`). | S |
| 1.5 | Add `compatibility:` field to `skills/temporal-architect-design/SKILL.md` and `skills/temporal-architect-author-go/SKILL.md`. | S |
| 1.6 | Update `tools/lsp/cmd/twf/README.md`. | S |

**Acceptance:** `twf skill` prints index; `twf skill list` enumerates; `twf skill design` prints `SKILL.md`; `twf skill design/reference/notation-reference.md` prints that file.

**Effort:** ~1 day.

## M2 — MCP server

`twf mcp` subcommand. Tools wrap existing subcommands; resources expose embedded spec + skills; prompts expose skill `SKILL.md` bodies.

**Open decision at start of M2:** Go MCP library — `mark3labs/mcp-go` vs `modelcontextprotocol/go-sdk`. Both meet the stdio + tools + resources + prompts needs. Spike both for ~2h.

| | Work | Effort |
|---|---|---|
| 2.1 | Pick Go MCP library. | S |
| 2.2 | New `tools/lsp/cmd/twf/mcp.go` registering the server. | M |
| 2.3 | **Tools**: `twf_check`, `twf_parse`, `twf_symbols`, `twf_spec_list`, `twf_spec_get`, `twf_skill_list`, `twf_skill_get`. | M |
| 2.4 | **Resources**: `twf://spec/<slug>` per spec section; `twf://skill/<name>` and `twf://skill/<name>/<file>` per skill. | M |
| 2.5 | **Prompts**: one per skill (`design`, `author-go`). | S |
| 2.6 | Integration test driving the server via the MCP inspector. | M |
| 2.7 | Docs: example MCP client configs for Claude Desktop, Cursor, Continue. | S |

**Acceptance:** A real MCP client (Claude Desktop or Cursor) connects via `twf mcp`; calls `twf_check`; discovers spec/skill resources; loads the `design` prompt.

**Effort:** ~2-3 days.

## M4 — `twf init` scaffolder

New `twf init` subcommand that scaffolds a starter `.twf` project in any directory. Depends on M1 (uses embedded skills/templates).

| | Work | Effort |
|---|---|---|
| 4.1 | New `tools/lsp/cmd/twf/init.go`. Flags: `--name`, `--mcp`, `--language go`. | M |
| 4.2 | Scaffolds (or appends to existing): `AGENTS.md`, `workflows.twf`, `Makefile`. Idempotent (delimited block on re-run). | M |
| 4.3 | Embedded templates under `tools/skills/templates/`. | S |
| 4.4 | Golden-file tests + round-trip (`twf init && twf check`). | S |

**Acceptance:** `twf init` in an empty dir produces a project that passes `twf check`. Idempotent re-run.

**Effort:** ~2 days.

## Sequencing

1. **M1** (~1 day). Mechanical, mirrors the `tools/spec/` pattern. New module lands at `tools/skills/`.
2. **M2** (~2-3 days). Pick MCP library; build server + tools/resources/prompts; verify with a real MCP client.
3. **M4** (~2 days). `twf init` scaffolder — depends on M1's embedded skills.

The distribution-side milestones (extension PATH wiring, brand rename + go-live, docs site) are sequenced in the dist repo's `packaging.md`.
