# Packaging & Distribution Research

Landscape pass on how to ship `temporal-skills` (the `twf` CLI/LSP, the spec,
the skills, and the visualizer) so they are first-class for **all three**
adoption audiences:

1. **Agentic runtimes** — Claude Desktop, Cursor Background Agents, CI bots,
   the spec-builder Temporal worker. Want typed, discoverable tool access and
   structured outputs.
2. **AI-assisted human devs across IDEs** — Cursor, Claude Code, Continue,
   Windsurf, Codex CLI, Copilot, Zed, Aider. Want SKILL.md or rules-style
   files plus a callable CLI.
3. **Programmatic consumers** — Python/TS scripts that drive an LLM and shell
   out to `twf`. Want a single install command and stable contracts.

Excludes work already covered by
[`issues_blocking_downstream_adoption.md`](./issues_blocking_downstream_adoption.md)
(twf binaries on Releases ✓, visualizer npm package, skills tarball / PyPI,
`twf check --json`, spec relocation ✓).

## Constraints

- **No paid hosting.** GitHub-native only: Releases, Pages, repos. No
  `temporal-skills.dev`, no hosted MCP, no telemetry sink.
- **Effort budget weighted toward packaging and publishing**, not
  authoring new content or running services.
- **Everything publishes via GitHub Actions on a `v*` tag.** Lockstep
  versioning across every artifact means one tag → one fan-out. The
  existing `release.yml` is the trunk; every new target is a job in the
  matrix. Manual `npm publish` / `twine upload` is not a target state.
- **Brand rename is pending.** Names are chosen but the publishing
  steps for `@temporal-skills/twf` and `twf-cli` ship **gated**
  (dry-runnable, guarded behind a `RELEASE=true` env flag) until the
  rename is settled.

---

## 1. The packaging gap, restated

Today "skill" and "tool" are coupled by convention (every SKILL.md says
"run `twf check`") but decoupled in distribution. Only the VSIX bundles
both. Every other install path — `go install`, `pip install`, raw GitHub
URL fetch, `npx`, brew — ships one or the other. Each new consumer has to
re-invent the join, and the SKILL.md silently assumes the join was done.

The ecosystem has converged on three primitives for closing this gap:

| Primitive | Coupling story | Standard format |
|---|---|---|
| **MCP servers** | Tools + resources + prompts in one server, one config line | `npx`/`uvx`/binary over stdio |
| **Agent Skills** | SKILL.md + assets + scripts in one directory; `compatibility` field declares tool deps | `SKILL.md` with YAML frontmatter |
| **Plugin marketplaces** (Claude Code) | A "plugin" bundles skills + agents + hooks + MCP servers | `marketplace.json` in a GitHub repo |

All three are *free* to publish (no registry account beyond GitHub
required for two of them; Smithery is free), and all three are how the
problem is being solved by adjacent projects.

---

## 2. Landscape findings

### 2.1 Model Context Protocol (MCP)

**What it is.** Open protocol (Anthropic-led, multi-vendor consumer)
that exposes three primitives over JSON-RPC to LLM clients:

- **Tools** — model-invoked functions with JSON schemas (`twf_check`,
  `twf_parse`, `twf_symbols`, `twf_spec`).
- **Resources** — application-controlled, browseable data (every spec
  section, every skill markdown file).
- **Prompts** — user-invoked templates / slash commands (the `design`
  and `author-go` skills as `/twf:design`-style invocations).

**Transports.** stdio (primary for local), streamable-HTTP, SSE.

**Distribution.** Clients (Claude Desktop, Cursor, Continue, Windsurf,
Zed) launch servers by command. The two canonical install lines are:

```bash
npx -y @scope/server-name           # JS/TS servers
uvx scope-server-name               # Python servers
```

Native binaries are equally legal — clients just need a `command` and
`args`. So a single-binary Go server (`twf mcp`) is a first-class
citizen, no wrapper needed.

**Registries.** Smithery and mcphub are the main listing sites. Both
free. Smithery accepts a public HTTPS URL (hosted) or an MCPB bundle
(local). For our case, "local via the existing `twf` binary" maps to a
Smithery server-card.json + a `npx` install line.

**Go libraries.** `mark3labs/mcp-go` (8.5K stars, mature, stdio + HTTP +
SSE) and the official `modelcontextprotocol/go-sdk`. Either embeds in
the existing `tools/lsp/cmd/twf` binary as a `mcp` subcommand alongside
`lsp`, `check`, `parse`, etc.

### 2.2 Anthropic Agent Skills (formal spec)

**Status.** Open standard at [agentskills.io](https://agentskills.io)
maintained by Anthropic, formalized Dec 18 2025. Available across the
Anthropic API, claude.ai, Claude Code, and (importantly) Cursor — both
products read the same `~/.cursor/skills/` and Cursor also reads
`~/.agents/skills/`, `.cursor/skills/`, `.agents/skills/` from project
roots.

**Frontmatter spec** (relevant fields):

| Field | Required | Notes |
|---|---|---|
| `name` | yes | 1-64 chars, lowercase + hyphens, must match parent dir name |
| `description` | yes | ≤1024 chars; the discovery decision is made from this |
| `license` | no | SPDX string or `LICENSE.txt` reference |
| `compatibility` | no | ≤500 chars; **"system packages, network access, or product requirements"** — exactly where we should declare `twf >= X.Y` |
| `metadata` | no | arbitrary key/value |
| `allowed-tools` | no | experimental; pre-approved tool list |

**Three-level progressive disclosure** is the official architecture
(metadata always loaded → SKILL.md body when triggered → linked files
on demand). Our existing `skills/{design,author-go}` already follow
this, but neither declares `compatibility`.

**Gap for us.** The `compatibility` field is the official place to
encode the SKILL→tool coupling — and we don't use it. Trivial fix.

### 2.3 Cursor skill discovery

Cursor recursively discovers `SKILL.md` from any of:

```
.agents/skills/         (project)
.cursor/skills/         (project)
~/.agents/skills/       (user)
~/.cursor/skills/       (user)
```

`~/.cursor/skills-cursor/` is reserved for Cursor's built-ins (do not
write there). The VSIX already installs to `~/.cursor/skills/` — that's
correct, and the same skill files work in Claude Code under
`~/.claude/skills/`.

### 2.4 Claude Code plugin marketplaces

**This is the big free-distribution surface we are not yet using.**

A marketplace is a GitHub repository with `.claude-plugin/marketplace.json`
at the root. Each plugin is a subdirectory with its own `.claude-plugin/plugin.json`,
and a plugin can bundle any combination of:

- `skills/` — SKILL.md files
- `agents/` — sub-agent prompts
- `commands/` — slash commands
- `hooks/` — lifecycle hooks
- `.mcp.json` — MCP server config

Users install with:

```
/plugin marketplace add jmbarzee/temporal-skills
/plugin install temporal-design@temporal-skills
```

**Free**, **GitHub-native**, **no hosting**, and **catalogs the same
artifacts we already ship** (skills/, .claude/commands/, and a future
MCP server). The marketplace JSON is ~50 lines.

### 2.5 AGENTS.md (cross-vendor convention)

**Status.** Governed by the Linux Foundation's Agentic AI Foundation
(Dec 2025). 60K+ repos. 20+ tools support: Cursor, Copilot, Windsurf,
Codex CLI, Devin, Gemini CLI, VS Code, Zed, Aider, Continue
(`AGENTS.md` → `AGENT.md` → `CLAUDE.md` fallback). Claude Code still
prefers `CLAUDE.md` natively but the content is interchangeable.

**What it's for.** A repo-root README *for agents*. Not a skill — a
project-specific context block: build/test commands, code-style rules,
boundaries. 32 KiB cumulative limit (Codex CLI).

**Two implications for us:**

1. We currently maintain `CLAUDE.md` at the repo root. Renaming or
   symlinking to `AGENTS.md` widens the supported-runtime set from 1
   (Claude Code) to 20+, for zero work.
2. We should ship a **template `AGENTS.md` snippet** that downstream
   `.twf`-using projects can drop into their own repos. Three lines
   that tell any of the 20+ tools "this repo uses .twf; run `twf check`;
   consult `twf spec`."

### 2.6 npm `optionalDependencies` platform packages (biome pattern)

**The industry-standard way to ship a native binary via npm without
postinstall scripts.** Used by Biome, esbuild, Turbo, Bun, Rollup. The
shape:

```
@temporal-skills/twf                  (main package — Node shim only)
├── optionalDependencies:
│   ├── @temporal-skills/twf-darwin-arm64
│   ├── @temporal-skills/twf-darwin-x64
│   ├── @temporal-skills/twf-linux-x64
│   ├── @temporal-skills/twf-linux-arm64
│   └── @temporal-skills/twf-win32-x64
└── bin/twf.js                        (resolves the platform pkg, spawns its binary)
```

Each `@temporal-skills/twf-<platform>` package has only the binary and a
tiny `package.json` declaring `os` and `cpu` fields. npm's native
resolution installs only the matching one. No download-at-install. No
postinstall scripts (which are increasingly disabled for supply-chain
reasons).

**Why this matters specifically for us.** Nearly every AI coding tool
ships some form of npm/Node tooling internally (Cursor, Claude Code,
Continue, Windsurf, …). `npx -y @temporal-skills/twf check` is a
zero-install line that works on any developer's machine and inside
nearly every agent's sandbox. It's also the *natural* MCP install line:

```jsonc
// In a user's MCP client config
{
  "twf": { "command": "npx", "args": ["-y", "@temporal-skills/twf", "mcp"] }
}
```

### 2.7 Homebrew tap (free, GitHub-hosted)

Create `jmbarzee/homebrew-twf` (or `jmbarzee/homebrew-tap`). GoReleaser
auto-updates the formula on release. Free; users install with:

```bash
brew install jmbarzee/twf/twf
```

This is what Terraform does (`hashicorp/tap`). dbt-core stopped
maintaining theirs due to dep-resolution issues, but those issues are
Python-specific — Go binaries are dependency-free, so the brew
experience stays clean.

### 2.8 PyPI distribution

For the spec-builder audience: `pip install temporal-skills` should
work and should produce a `twf` on PATH. Options:

- **Data-only package** (`temporal-skills-prompts`, your existing
  Issue 3b): just the markdown, no binary. Cleanest but doesn't solve
  the "join."
- **Bin-wrapper wheels** like biome's pattern: one wheel per
  platform-tag, each carrying the binary. `pip install twf-cli` works
  on every supported OS/arch without a network call at install time.

Both ship from the same release workflow. The bin-wrapper approach is
the better single artifact.

### 2.9 GitHub Pages docs site (free)

Not core, but: a static site auto-generated from `tools/spec/sections/*.md`
+ `skills/**/*.md` + an embedded standalone visualizer (vite build →
static HTML) is fully free on Pages. mkdocs-material or Docusaurus
both do this in ~20 lines of config and one workflow file. Updated on
every release via GH Action.

Useful primarily for *discovery* (searchable spec, "what is this
project") and as a `<iframe>`-able playground for marketing/demos.
Strictly Tier 3 — not blocking any audience.

### 2.10 Comparable projects' stacks

| Project | DSL/CLI/IDE shape | What they ship |
|---|---|---|
| **Biome** (Rust) | linter+formatter | `@biomejs/biome` npm (with platform subpkgs), brew, docker, VS Code ext, Open VSX |
| **Terraform** (Go) | infra DSL | `hashicorp/tap` brew, apt/rpm repos, direct binaries, VS Code ext, provider registry |
| **dbt** (Python) | data DSL | PyPI core + adapters, CLI, VS Code ext (dbt Fusion is Rust + CDN) |
| **OpenAPI Generator** (Java) | spec→code | Maven, npm, brew, docker, JAR, plugin ecosystem |

All four cross-publish to multiple package managers from a single CI.
None of them depend on hosted infrastructure beyond GitHub Releases +
the public package registries. The single common pattern: **one source
of truth in the repo; the CI fans out to every registry on tag.**

---

## 3. The proposed bundle

If we did one thing per audience, it would be:

| Audience | The one-line install we want | What it gives them |
|---|---|---|
| Agentic runtimes (any MCP client) | Add `npx -y @temporal-skills/twf mcp` to their MCP config | Typed `twf_*` tools, browseable spec/skill resources, `design`/`author-go` prompts |
| AI-assisted human devs (any IDE) | `/plugin marketplace add jmbarzee/temporal-skills` (Claude Code) **or** `~/.cursor/skills/temporal-*` from VSIX/marketplace bundle (Cursor) **or** AGENTS.md (everyone else) | The SKILL.md files reach the agent; `twf` reaches the terminal |
| Programmatic consumers | `npx -y @temporal-skills/twf check`, `pip install twf-cli`, or `curl … install.sh` (existing) | A binary on PATH, deterministic JSON output (#4 from existing issues), embedded skills/spec |

Notice the bundle: **one binary**, **one npm package**, **one
marketplace**. Everything else is metadata pointing at those three.

---

## 4. Prioritized work plan

### Tier 1 — the join

These three turn "skill + tool" into one artifact and unblock all three
audiences at once.

#### T1a. Embed skills in the `twf` binary + `twf skill` subcommand

Mirror the existing `tools/spec/` pattern. New `tools/skills/` module
with `//go:embed skills/*/**`, exposed via:

```bash
twf skill                    # full skill index
twf skill list               # slug + description table
twf skill design             # print design/SKILL.md
twf skill design/reference/notation-reference.md
```

Mechanical, low-risk, ~1 day. Backbone for the MCP server (T1b) and
removes the file-sync requirement for any runtime that just wants the
prompt content.

Skills source-of-truth stays at `skills/` in the repo. The VSIX still
copies them to `~/.cursor/skills/` for Cursor's discovery. The
embedded copy is for runtimes that don't speak Cursor's discovery
convention (CI bots, Python scripts, MCP clients).

#### T1b. `twf mcp` subcommand (MCP server colocated with the binary)

Using `mark3labs/mcp-go` (or the official `modelcontextprotocol/go-sdk`
if mature enough — confirm during implementation):

- **Tools**: `twf_check`, `twf_parse`, `twf_symbols`, `twf_spec`,
  `twf_skill_list`, `twf_skill_get`. JSON schemas autogenerated.
- **Resources**: `twf://spec/<slug>` for every spec section,
  `twf://skill/<name>` and `twf://skill/<name>/<file>` for skills.
- **Prompts**: `design`, `author-go` (the SKILL.md body as a prompt
  template).

Single binary, single config line. Works in Claude Desktop, Cursor,
Continue, Windsurf, Zed, the Cursor SDK, and the spec-builder Temporal
worker (which already shells to `twf`).

**This is the single highest-leverage change** because it kills the
skill/tool decoupling entirely: the MCP client *gets both* in one
handshake.

#### T1c. Add `compatibility` to existing SKILL.md frontmatter

```yaml
---
name: temporal-workflow-design
description: …
compatibility: >
  Requires `twf` CLI on PATH (any 0.3+ release). Install:
  npx -y @temporal-skills/twf, brew install jmbarzee/twf/twf,
  or run `twf mcp` as an MCP server.
---
```

5-minute change; makes the dependency machine-readable for any runtime
that respects the spec.

### Tier 2 — publish to every package manager

One CI fan-out from the existing release pipeline. Each is independent
and small.

#### T2a. `@temporal-skills/twf` npm package (biome `optionalDependencies` pattern)

Five platform subpackages, one wrapper, no postinstall script. Adds
the canonical agent-runtime install line:

```bash
npx -y @temporal-skills/twf mcp
```

Subsumes the existing `install.sh` for the npm-ecosystem audience
(which is almost all of it) and is the right shape for the agentic
runtimes (Claude Desktop, Cursor MCP configs).

#### T2b. `twf-cli` on PyPI — bin-wrapper wheels

Same pattern as biome but as platform-tagged wheels. `pip install
twf-cli` produces a `twf` on PATH. Unblocks the spec-builder Python
project (and any future Python agent).

**Decision:** ship the skills tarball *in addition to* T1a embedding
(per project owner). The two artifacts serve different consumers: the
tarball is for runtimes/CI that need to read the markdown without
running the binary (e.g. building prompt libraries, doc tooling); the
embedded copy is for runtimes that have the binary and want it
self-describing.

#### T2c. Homebrew tap `jmbarzee/homebrew-twf`

GoReleaser → auto-formula → `brew install jmbarzee/twf/twf`. Standard
for macOS/Linux devs who aren't in Node-land. Free, GitHub-hosted, ~20
lines of `.goreleaser.yml`.

### Tier 3 — discovery / ecosystem signals

These ride on top of Tier 1+2 and cost very little.

#### T3a. Claude Code plugin marketplace at this repo

Add `.claude-plugin/marketplace.json` at the repo root cataloging a
**single combined plugin** (`temporal-skills`) that bundles:

- both skills (`skills/design/`, `skills/author-go/`)
- the relevant `.claude/commands/`
- an MCP server entry pointing at `npx -y @temporal-skills/twf mcp`
  (or the equivalent binary path)

Users install with:

```
/plugin marketplace add jmbarzee/temporal-skills
/plugin install temporal-skills@temporal-skills
```

The skills, commands, and MCP server we already have *all* become
addressable from inside Claude Code with no new artifacts. The plugin
version field in `marketplace.json` is bumped in lockstep with the Git
tag by `scripts/version.sh`.

#### T3b. Rename/symlink `CLAUDE.md` → `AGENTS.md`

20+ tools start respecting our repo-level agent guidance for the cost
of `git mv` plus a one-line symlink for Claude Code's preferred path.

#### T3c. Template `AGENTS.md` snippet in README

A copy-pastable block that any project using `.twf` can drop into their
own `AGENTS.md`. Three lines saying "this project uses .twf; run `twf
check` after edits; consult `twf spec <slug>` for grammar." Surfaces
`twf` to the agent in any of 20+ tools without requiring any per-tool
configuration.

#### T3d. List `twf mcp` on Smithery

Free MCP registry. Submission is a server-card.json + the npx install
line we already have from T2a. Discovery surface for non-Anthropic MCP
clients.

#### T3e. GitHub Pages docs site

Optional. Static site from `tools/spec/sections/*.md` +
`skills/**/*.md` + standalone visualizer. mkdocs-material or
Docusaurus. Free, but lowest leverage of the bunch — every audience
above is served without it.

---

## 5. Decisions needed before we start

1. **Go MCP library**: `mark3labs/mcp-go` (mature, widely used) vs
   `modelcontextprotocol/go-sdk` (official, possibly less battle-tested).
   Defer until T1b begins; verify which is more stable at that time.

2. **npm package name**: `@temporal-skills/twf` (matches existing
   visualizer scope plan in Issue 2) vs `twf` (unscoped, shorter, may
   be taken). Recommend scoped.

3. **PyPI package name**: `temporal-skills` (claims the brand,
   collides with the markdown-only Issue 3b idea) vs `twf-cli` (clear
   purpose, leaves `temporal-skills` for a future bigger package).

4. **Skills tarball (Issue 3a) vs `twf skill` embedding (T1a)** —
   if T1a lands first, do we still ship the tarball? Probably not;
   one less artifact to maintain. Cuts Issue 3a from the queue.

5. **AGENTS.md vs CLAUDE.md** at repo root — keep both, or pick one?
   Simplest: rename to AGENTS.md, symlink CLAUDE.md → AGENTS.md.

6. **Claude Code marketplace granularity** — one combined plugin
   (`temporal-skills`), two plugins (`temporal-design`,
   `temporal-author-go`), or one plugin per skill plus a base? Suggest
   two, so users opt into authoring without opting into design (and
   vice versa).

7. **Versioning lockstep** — `@temporal-skills/twf` and `twf-cli` and
   the brew formula should all track the existing `v*` Git tags
   already used by the VSIX. Confirm `scripts/version.sh` extends to
   bump npm and PyPI versions in the same commit.

---

## 6. What we are explicitly *not* doing

- No hosted MCP server. (Local-only over stdio.)
- No paid domain or hosted docs site. (Pages only, if anything.)
- No telemetry. (No infrastructure to receive it.)
- No skill registry of our own. (We list on the ecosystem's: Smithery,
  Claude Code marketplaces, Cursor's auto-discovery, Anthropic's
  agentskills.io directory if one materializes.)
- No backwards-compat shims for pre-v1 contracts (per CLAUDE.md).

---

## 7. References

- [Model Context Protocol — Specification](https://modelcontextprotocol.io/specification/latest)
- [Anthropic Agent Skills — Specification](https://agentskills.io/specification)
- [Anthropic — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Cursor Docs — Agent Skills](https://cursor.com/docs/skills)
- [Claude Code Docs — Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Claude Code Docs — Create and distribute a plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [AGENTS.md](https://agents.md/) — Linux Foundation Agentic AI Foundation
- [Smithery — Publish an MCP server](https://smithery.ai/docs/build/publish)
- [mark3labs/mcp-go](https://github.com/mark3labs/mcp-go)
- [modelcontextprotocol/go-sdk](https://github.com/modelcontextprotocol/go-sdk)
- [Distributing Platform-Specific Binaries with npm — magicbell.com](https://www.magicbell.com/blog/distributing-platform-specific-binaries-with-npm)
- [Biome — VS Code extension](https://biomejs.dev/reference/vscode/) and [@biomejs/biome on npm](https://www.npmjs.com/package/@biomejs/biome)
- [Homebrew — How to Create and Maintain a Tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap)
- [HashiCorp Official Packaging Guide](https://www.hashicorp.com/official-packaging-guide?product_intent=terraform)
- [Continue — AGENTS.md PR #7717](https://github.com/continuedev/continue/pull/7717)
