# Roadmap — engine

Toolchain (`twf` binary) feature milestones. These were tracked as part of the
packaging epic but are **engine work** — they ship in the binary built from
`tools/`. Distribution/packaging milestones (extension PATH wiring, brand rename,
docs site) live in the distribution repo's
[`packaging.md`](https://github.com/jmbarzee/temporal-architect-dist/blob/main/packaging.md).

Status: **M2 is shipped**; **M1 and M4 are parked** (M4 depends on M1, and M1
also unblocks the skill-related MCP surface). Effort sizes: S ≈ hours, M ≈ a day.

## M2 — MCP server — **shipped**

`twf mcp` ships as a Model Context Protocol server over stdio, built on the
official `modelcontextprotocol/go-sdk`. It lives at
`tools/lsp/cmd/twf/internal/command/mcp/` (the `cmd/twf` tree is organized as
one package per command under `internal/command/`).

**What shipped:**

- **Tools** (thin wrappers over the same `internal/envelope` pipeline the CLI
  uses, so output is byte-identical to the subcommands): `twf_check`,
  `twf_parse`, `twf_symbols`, `twf_graph`, `twf_graph_chunks`, `twf_spec_list`,
  `twf_spec_get`. Each file tool takes `paths` **or** inline `source`.
- **Resources**: the embedded spec at `twf://spec` and each section at
  `twf://spec/<slug>`.
- **Integration test** driving the server over an in-memory transport
  (`mcp_test.go`).

**Intentionally cut from the original plan:** skill tools / `twf://skill/...`
resources / per-skill prompts (the binary does not embed skills — that is M1),
push diagnostics via an internal LSP, and non-stdio transports (local
`npx … twf mcp` only).

**Deferred enhancements** (structured/typed tool output, history-mode inputs,
completion handler, richer annotations) are tracked in
`internal/changes/parser/BACKLOG.md` under "`twf mcp` Enhancements (post-MVP)".

**Remaining polish:** example MCP client configs for Claude Desktop / Cursor /
Continue in the docs.

## M1 — Self-describing binary — **parked**

Embed skills in the `twf` binary and add a `twf skill` subcommand mirroring `twf spec`. Add a `compatibility:` field to each `SKILL.md` (the official Agent Skills spec field for declaring tool dependencies). This also unblocks the skill-related MCP surface cut from M2 (skill tools, `twf://skill/...` resources, per-skill prompts) and is a prerequisite for M4.

| | Work | Effort |
|---|---|---|
| 1.1 | New module `tools/skills/` with `//go:embed skills/**` and `Skills()` / `Get(name)` / `Open(name, path)`. Pattern: clone `tools/spec/spec.go`. | S |
| 1.2 | New command package `tools/lsp/cmd/twf/internal/command/skill/`: `twf skill`, `twf skill list`, `twf skill <name>`, `twf skill <name>/<file>`, wired into `root.go`. Pattern: clone `internal/command/spec/`. | S |
| 1.3 | Test mirroring `tools/spec/spec_test.go`: each embedded skill has a `SKILL.md`, valid YAML frontmatter, `name` matches directory name. | S |
| 1.4 | Wire `tools/skills/` into `go.work` and `tools/lsp/go.mod` (relative `replace`). | S |
| 1.5 | Add `compatibility:` field to `skills/temporal-architect-design/SKILL.md` and `skills/temporal-architect-author-go/SKILL.md`. | S |
| 1.6 | Update `tools/lsp/cmd/twf/README.md`. | S |

**Acceptance:** `twf skill` prints index; `twf skill list` enumerates; `twf skill design` prints `SKILL.md`; `twf skill design/reference/notation-reference.md` prints that file.

**Effort:** ~1 day.

## M4 — `twf init` scaffolder — **parked** (depends on M1)

New `twf init` subcommand that scaffolds a starter `.twf` project in any directory. Depends on M1 (uses embedded skills/templates).

| | Work | Effort |
|---|---|---|
| 4.1 | New command package `tools/lsp/cmd/twf/internal/command/init/`. Flags: `--name`, `--mcp`, `--language go`. | M |
| 4.2 | Scaffolds (or appends to existing): `AGENTS.md`, `workflows.twf`, `Makefile`. Idempotent (delimited block on re-run). | M |
| 4.3 | Embedded templates under `tools/skills/templates/`. | S |
| 4.4 | Golden-file tests + round-trip (`twf init && twf check`). | S |

**Acceptance:** `twf init` in an empty dir produces a project that passes `twf check`. Idempotent re-run.

**Effort:** ~2 days.

## Sequencing

1. **M1** (~1 day). Mechanical, mirrors the `tools/spec/` pattern. New module lands at `tools/skills/`. Unblocks the skill-related MCP surface and M4.
2. **M4** (~2 days). `twf init` scaffolder — depends on M1's embedded skills.

The distribution-side milestones (extension PATH wiring, brand rename + go-live, docs site) are sequenced in the dist repo's `packaging.md`.
