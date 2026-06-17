# Packaging and Distribution

How temporal-architect ships — the catalog of distribution channels, the conventions that govern packaging work, and the remaining milestones to close out the epic.

> **Two-repo topology.** Packaging has been split out of the toolchain. This repo
> (`jmbarzee/temporal-architect`) is a pure toolchain: it builds the engine + rendering
> source and cuts a single **GitHub Release** of primitive artifacts (per-platform `twf`
> binaries, `skills-vX.Y.Z.tar.gz`, the visualizer lib + webview bundle, the
> `@temporal-architect/wire-types` tarball, `SHA256SUMS`, `install.sh`). The
> **distribution repo** (`jmbarzee/temporal-architect-dist`) consumes those assets and
> publishes every registry package. On each `v*` tag this repo cuts the Release and fires a
> `repository_dispatch` carrying the version; dist stamps it into its manifests and
> publishes in lockstep. **All `_publish-*` workflows, registry secrets, and the
> packaging manifests (`packages/vscode`, `packages/npm`, `packages/pypi`,
> `.claude-plugin`, `bump-brew`) now live in the dist repo** — sections below that describe
> them (Current state, Release pipeline, Conventions C2–C7, External account checklist)
> describe the *combined* system; the publish half is owned by dist.

## Audiences

The packaging story serves three audiences:

1. **Agentic runtimes** — Claude Desktop, Cursor MCP, CI bots, the spec-builder Temporal worker. Want typed, discoverable tool access and structured outputs.
2. **AI-assisted human devs across IDEs** — Cursor, Claude Code, Continue, Windsurf, Codex CLI, Copilot, Zed, Aider. Want SKILL.md or rules-style files plus a callable CLI.
3. **Programmatic consumers** — Python/TS scripts that drive an LLM and shell out to `twf`. Want a single install command and stable contracts.

The bundle is intentionally small: **one binary** (`twf`), **one npm package** (`@temporal-architect/twf`), **one marketplace plugin** (Claude Code). Everything else is metadata pointing at those three.

## Constraints

- **No paid hosting.** GitHub-native only: Releases, Pages, repos. No `temporal-architect.dev`, no hosted MCP, no telemetry sink.
- **Effort weighted toward packaging and publishing**, not authoring new content or running services.
- **Everything publishes via GitHub Actions on a `v*` tag.** Lockstep versioning across every artifact: one tag, one fan-out. The `release.yml` orchestrator is the trunk; every new target is a job in the matrix. No manual `npm publish` / `twine upload`.

---

## Current state

Distribution surfaces and where their sources live:

Distribution surfaces, where their source lives (T = this toolchain repo, D = dist repo), and how they ship:

| Channel | Source | Install line | Audience |
|---|---|---|---|
| Go binary direct | `tools/lsp/` (T) | `curl -sSL .../install.sh \| bash` or `go install .../tools/lsp/cmd/twf@latest` | Direct binary users |
| VS Code / Cursor / Open VSX extension | `packages/vscode/` (D); binary + webview + wire-types downloaded from the T Release | VSIX (5 platforms) on VS Code Marketplace + Open VSX | Cursor, VS Code, Codium devs |
| npm wrapper + 5 platform sub-packages | `packages/npm/` (D); binary archives from the T Release | `npx -y @temporal-architect/twf` (also the canonical MCP install line) | Node / TS, MCP clients |
| npm visualizer + wire-types | built in T (`tools/visualizer`, `tools/wire-types`); published from D | `npm install @temporal-architect/visualizer` / `…/wire-types` | Library + type consumers |
| PyPI wheels | `packages/pypi/twf-cli/` (D); binary archives from the T Release | `pip install twf-cli` | Python ecosystem, spec-builder Temporal worker |
| Homebrew tap | `bump-brew` (D) against `jmbarzee/homebrew-twf`, pinning T Release URLs/SHAs | `brew install jmbarzee/twf/twf` | macOS / Linux desktop devs |
| Claude Code plugin | `packages/npm/claude-plugin/` (D); catalog at `.claude-plugin/marketplace.json` (D root) | `/plugin marketplace add jmbarzee/temporal-architect-dist` | Claude Code users |
| Skills tarball | `skills/` (T) via `internal/release/gen-skills-manifest/` | `skills-vX.Y.Z.tar.gz` GitHub Release asset | Prompt-library builders, non-binary consumers |

All channels converge on the same `twf` binary and the same embedded skills + spec.

### Release pipeline (two repos, one event)

```
[toolchain repo]  git tag vX.Y.Z && git push --tags
        |
        v
release.yml (release-cutter)
  +-- _check-versions          assert tools/visualizer + tools/wire-types match the tag
  +-- _build-binaries          matrix: 5 platforms; twf binary archives
  +-- _build-skills-tarball    deterministic skills-vX.Y.Z.tar.gz asset
  +-- _build-artifacts         visualizer lib + webview bundle + wire-types tarballs
  +-- _publish-github-release  SHA256SUMS + all assets + install.sh
  +-- dispatch-dist            repository_dispatch {version} -> dist repo (DIST_DISPATCH_TOKEN)
        |
        v
[dist repo]  _consume-release.yml (on repository_dispatch: toolchain-release)
  +-- download all Release assets; stamp manifests to vX.Y.Z; _check-versions
  +-- _publish-vsix             VS Code Marketplace + Open VSX (embeds downloaded webview)
  +-- _publish-npm-twf          @temporal-architect/twf + 5 platform sub-packages
  +-- _publish-npm-visualizer   @temporal-architect/visualizer (re-publish downloaded tarball)
  +-- _publish-npm-wire-types   @temporal-architect/wire-types (re-publish downloaded tarball)
  +-- _publish-npm-claude-plugin @temporal-architect/claude-plugin
  +-- _publish-pypi             twf-cli wheels x 5 + twine upload
  +-- _publish-brew             bump-brew -> jmbarzee/homebrew-twf formula
```

The toolchain keeps only `GITHUB_TOKEN` + `DIST_DISPATCH_TOKEN`; all registry secrets live in dist.

---

## Conventions

These rules govern any new packaging work.

### C1. Go release tooling lives in `internal/release/<name>/`

Each tool is its own Go module, wired into `go.work`. Structure per tool:

```
internal/release/<name>/
  go.mod
  main.go
  main_test.go
```

New tools follow the same shape and add their directory to `go.work`'s `use` list.

### C2. Single-manifest npm publishing

Each npm package's `package.json` is *both* the dev manifest *and* the publish manifest:

- Scoped public name (e.g. `@temporal-architect/visualizer`).
- `"files"` allowlist — only ship build output, README, LICENSE; never source or devDeps.
- `"prepublishOnly"` runs the build before `npm publish`.
- `"prepack"` / `"postpack"` copy `LICENSE` from the repo root and clean up after.
- `"peerDependencies"` (not `"dependencies"`) for consumer-managed runtime deps like React.
- `"devDependencies"` stays for the dev workflow; doesn't ship because of the `files` allowlist.

Generalizes to wrapper + sub-package shapes (e.g. `@temporal-architect/twf`).

### C3. Inline sed for version bumping

`Makefile`'s `release:` target uses `sed -i.bak` per manifest. Each new manifest gets one more `sed` line. Pattern:

```makefile
@sed -i.bak 's/"version": *"[^"]*"/"version": "$(NEW_VERSION)"/' <file> && rm -f <file>.bak
```

`.claude-plugin/marketplace.json` carries `version` strings inline (the plugin entry uses Claude Code's `strict: false` mode and declares the plugin definition directly). The `release:` target's `sed -g` flag updates every `"version"` key in the file in lockstep.

### C4. Verb-noun Makefile naming

Targets follow `<verb>-<thing>[-<variant>]`:

- `build-lsp`, `build-visualizer`, `build-visualizer-lib`, `build-skills`, `build-extension`, `build-claude-plugin`
- `build-twf-archive`, `build-skills-archive`, `build-pypi-wheel`
- `package-platform`, `package-all`
- `publish-vscode`, `publish-ovsx`, `publish-npm-platform`, `publish-npm`, `publish-npm-claude-plugin`, `publish-pypi`, `publish-brew`

### C5. Manifest version validation

`_check-versions.yml` asserts the git tag matches every checked-in manifest's version. Each manifest gets one `check_node` or `check_pyproject` call. Inline bash; no extracted Go validator.

### C6. Phase-based reusable workflows

`.github/workflows/release.yml` is a thin orchestrator. Per-phase reusables use a phase prefix (`_check-`, `_build-`, `_publish-`). Secrets are passed **explicitly** by the orchestrator — each reusable declares which secrets it needs via `workflow_call.secrets`. No `secrets: inherit` anywhere.

New publish channels follow the pattern: one new `_publish-<channel>.yml` file plus one `<channel>:` job in `release.yml`.

### C7. Claude Code plugin ships from npm; only the marketplace catalog stays at the root

The Claude Code plugin payload (`@temporal-architect/claude-plugin`) lives at [`packages/npm/claude-plugin/`](./packages/npm/claude-plugin/) like every other npm package. Its `skills/` is a **build artifact** — `make build-claude-plugin` rsyncs the canonical `skills/` from the repo root into the package; the copy is gitignored.

The marketplace catalog at `.claude-plugin/marketplace.json` is the only thing forced to live at the repo root. It uses `strict: false` to declare the plugin's components inline (skills path, MCP server config) and points at the npm package as the plugin source. Claude Code does `npm install` to fetch the payload at install time.

The dev-cycle harness (the `.claude/skills/dev-cycle/` skill plus its manifest `internal/harness/components.md`) and the standalone helper skills (`.claude/skills/expand-idea/`, `.claude/skills/reflect-skill/`) are intentionally **not** part of the plugin — they are dev scaffolding for this repo, not for downstream users. `internal/` is dev-only by convention, and the shipped skills come from the repo-root `skills/`, never from `.claude/skills/`.

---

## Goals

### M1 — Self-describing binary

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

### M2 — MCP server

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

### M3 — Agent-discoverable binary on PATH

**Status:** 3.1 + 3.2 + 3.3 done — `linkTwfOnPath` in `packages/vscode/src/extension.ts` symlinks the bundled `twf` into `~/.local/bin` on activation (copy on Windows), refreshes per version, and guards a user-managed `twf` via a `globalState`-recorded ownership marker. 3.3 (skill/onboarding note) landed via the reposition: the README "Skills" section documents that skills assume `twf` on PATH and the agent's graph surface is `twf graph --json` (the visualizer GUI stays human-facing via `twf.visualize`).

The extension bundles `twf` and prepends its `bin/` to the **integrated terminal** via
`environmentVariableCollection` (`setupTerminalPath`), but that does **not** reach the AI agent's
shell — confirmed empirically: in an agent shell with the extension installed, `twf` resolves only
if the user separately `go install`ed it (`~/go/bin/twf`); the extension `bin/` is absent from the
agent PATH. So extension-only users (the common case) get an AI that can't find `twf` and digs around
or runs full paths. (This was the reverse-engineering reflection's recurring friction.)

| | Work | Effort |
|---|---|---|
| 3.1 | On activation, symlink (or copy) bundled `twf` into a dir already on the agent PATH — `~/.local/bin/twf` on macOS/Linux (confirmed present; already holds `claude`), platform equivalent on Windows. Refresh on each activation so it tracks the extension version. | S |
| 3.2 | Guard: don't clobber a user-managed `twf` (e.g. if `~/.local/bin/twf` exists and isn't our symlink, leave it / warn). Keep the existing integrated-terminal `environmentVariableCollection` for human terminals. | S |
| 3.3 | **Done.** Skill/onboarding note: skills assume `twf` on PATH; the **visualizer** is not a CLI — the agent's surface to graph data is `twf graph --json` (the GUI stays human-facing via the `twf.visualize` command). Landed in the README "Skills" section via the reposition. | S |

**Acceptance:** With only the extension installed (no `go install`), a fresh agent shell resolves
`twf` on PATH and `twf graph --json` works. No path-digging.

**Why it matters (North Star):** keeping the AI out of "where is the tool" busywork is exactly the
context-protection the project is built on.

### M4 — `twf init` scaffolder

New `twf init` subcommand that scaffolds a starter `.twf` project in any directory. Depends on M1 (uses embedded skills/templates).

| | Work | Effort |
|---|---|---|
| 4.1 | New `tools/lsp/cmd/twf/init.go`. Flags: `--name`, `--mcp`, `--language go`. | M |
| 4.2 | Scaffolds (or appends to existing): `AGENTS.md`, `workflows.twf`, `Makefile`. Idempotent (delimited block on re-run). | M |
| 4.3 | Embedded templates under `tools/skills/templates/`. | S |
| 4.4 | Golden-file tests + round-trip (`twf init && twf check`). | S |

**Acceptance:** `twf init` in an empty dir produces a project that passes `twf check`. Idempotent re-run.

**Effort:** ~2 days.

### M5 — Brand rename + go live

External event-driven. Two sub-phases:

- **M5a (whenever):** External account setup so the next tag push doesn't fail on new publish channels. See [External account checklist](#external-account-checklist).
- **M5b (when brand is settled):** Bulk find-replace per [Rename inventory](#rename-inventory); create new external registrations; flip publishing.

**Effort:** ~0.5 day for the actual flip, assuming external accounts are pre-staged and brand decisions are made.

### M6 — GitHub Pages docs site (optional polish)

Static site from `tools/spec/sections/*.md` + `skills/**/*.md` + the standalone visualizer build, hosted at `<user>.github.io/temporal-architect/`. mkdocs-material or Docusaurus.

**Recommended:** defer until M1-M5 are settled. Lowest leverage in the plan.

**Effort:** ~1-2 days.

---

## Rename inventory

Every place the brand appears, internally and externally. Walk this checklist when the rename ships.

**Not in scope of the rename:**

- The CLI binary name: `twf`.
- The DSL file extension: `.twf`.
- The product the skills describe: `Temporal` (Temporal Technologies' platform). The skill `name` fields (`temporal-architect-design`, `temporal-architect-author-go`) carry the `temporal-architect` brand, but the body content references Temporal Technologies' platform — that usage stays.

### Repo-internal references

| Category | Files | What to change |
|---|---|---|
| Go module paths | `tools/lsp/go.mod`, `tools/spec/go.mod`, all `internal/release/*/go.mod` | `github.com/jmbarzee/temporal-architect/*` → new. Triggers cascade through Go imports. |
| Go source imports | `tools/**/*.go`, `internal/release/**/*.go` | Mechanical: `goimports -w` after a `sed` pass. |
| `go.work` | `go.work` | Module use-paths (if directories also move). |
| npm manifests | `tools/visualizer/package.json` (shipped), `packages/npm/twf/package.json`, 5 sub-package manifests | `name`, `repository.url`, `repository.directory`, `homepage`. Sub-package `optionalDependencies` keys all change scope. |
| Visualizer publish output | `tools/visualizer/dist-lib/lib.js`, `tools/visualizer/src/lib.ts`, `tools/visualizer/vite.lib.config.ts` | Rebuild after manifest change. |
| PyPI manifest | `packages/pypi/twf-cli/pyproject.toml` | `name` (if package name itself changes), `urls.Homepage`, `urls.Source`. |
| Homebrew formula template | `internal/release/bump-brew/main.go` | `homepage` literal, URL template (repo path). |
| Claude Code plugin catalog | `.claude-plugin/marketplace.json` | `name`, `owner`, `homepage`, plugin source's npm package reference (`@temporal-architect/claude-plugin` → new scope). |
| Claude Code plugin payload | `packages/npm/claude-plugin/package.json`, `packages/npm/claude-plugin/README.md` | `name`, `repository.url`, `homepage`. Package name change is the same scope rename as the rest of npm. |
| VSIX extension | `packages/vscode/package.json` | `publisher` (if changing identity), `repository.url`. `name` (`twf-syntax`) likely stable. |
| VSIX install instructions | `packages/vscode/README.md`, `packages/vscode/src/extension.ts` | Marketplace URL + `go install` URL. |
| Install script | `packages/install.sh` | `REPO="jmbarzee/temporal-architect"` |
| READMEs | `README.md`, `tools/README.md`, `tools/visualizer/README.md`, `tools/lsp/cmd/twf/README.md`, `tools/spec/README.md`, `skills/MANIFEST.md`, `skills/{design,author-go}/README.md`, `packages/README.md`, `internal/README.md`, `.claude-plugin/README.md` | All install lines, all `github.com/jmbarzee/temporal-architect` URLs, "Quick install" table. |
| Repo-development guidance | `AGENTS.md` | Project-overview prose, file paths. |
| Changelog | `CHANGELOG.md` | New entries use new URL; historical entries stay. |
| Skill compatibility field (after M1) | `skills/temporal-architect-design/SKILL.md`, `skills/temporal-architect-author-go/SKILL.md` | Frontmatter `compatibility:` references new install lines. |
| `twf init` templates (after M4) | `tools/skills/templates/AGENTS.md.tmpl`, etc. | The scaffolded AGENTS.md block, install instructions baked into templates. |
| `.claude/skills/dev-cycle/` | `SKILL.md` + 13 `references/` prompts | Spot-check for brand-name mentions. Mostly relative paths. |
| `.claude/skills/` | `expand-idea`, `reflect-skill` | Spot-check for brand-name mentions. |
| `internal/harness/components.md` | 1 file | Component manifest; spot-check scopes/paths. |

**Mechanical strategy:**

1. `find . -type f \( -name '*.go' -o -name '*.json' -o -name '*.md' -o -name '*.ts' -o -name '*.toml' \) -exec sed -i '' 's|jmbarzee/temporal-architect|<new-owner>/<new-repo>|g' {} +`
2. Same for `@temporal-architect/` → `@<new-scope>/`.
3. `goimports -w ./...` to normalize Go imports.
4. Rebuild every npm package (publish output baked from manifest).
5. Run full test suite + `release.yml` dry-run on a branch.
6. Spot-check Markdown for prose mentions of the brand.

### External coordinates

| Coordinate | Current | Rename behavior | Strategy |
|---|---|---|---|
| GitHub repo | `github.com/jmbarzee/temporal-architect` | Rename + URL redirect supported | Rename on GitHub; source-file URLs updated for cleanliness. |
| GitHub Releases | All historical | Tied to repo; survives rename | No action — redirect handles it. |
| npm scope `@temporal-architect` | Shipped (visualizer) | **Immutable** — cannot rename | Create new scope; publish under it; mark old as `deprecate` with pointer. |
| `@temporal-architect/visualizer` | Shipped | Cannot rename | Final `0.x` release + `npm deprecate`; first release under new scope. |
| `@temporal-architect/twf` | Shipped after first `M-` release | If rename before first publish: claim new name | If after: same deprecate-and-republish pattern. |
| PyPI `twf-cli` | Pending first publish | **Immutable** | If rename before first publish: claim new name. If after: publish new name; yank old with redirect note. |
| VS Code Marketplace `jmbarzee.twf-syntax` | Shipped | **Extension IDs immutable** (publisher.name) | New publisher + new extension; old becomes "deprecated, install [new]". |
| Open VSX `jmbarzee/twf-syntax` | Shipped | Same as VS Code | Same strategy. |
| Homebrew tap `jmbarzee/homebrew-twf` | Pending first publish | Can rename via GitHub | Easy: rename tap repo; users re-tap. |
| Claude Code marketplace | GitHub-resolved | Follows repo rename | No action beyond repo URL. Users `/plugin marketplace add <new-owner>/<new-repo>`. |
| Smithery MCP listing (post-M2) | Pending | Manual re-submission | Re-submit; deprecate old if applicable. |

### Pre-rename decisions

| # | Question | Why it matters |
|---|---|---|
| Q1 | Does the GitHub repo rename? | If yes: every URL across repo-internal and external coordinates updates. If no: only the npm/PyPI/etc. coordinates change. |
| Q2 | Does the VS Code Marketplace publisher rename? | If yes: VSIX is effectively a new product (no install carryover). If no: just extension name changes. |
| Q3 | Migrate existing users or just deprecate-and-forget? | Migration = deprecate-and-republish + clear migration docs. No migration = old listings become tombstones. |

---

## External account checklist

Out-of-band steps required before the next tag push works end-to-end. None can be automated; all need account creation, manual approvals, or GitHub repo secret management.

### Already configured

| Service | Account / value | GitHub secret |
|---|---|---|
| VS Code Marketplace | publisher `jmbarzee` | `VSCE_TOKEN` |
| Open VSX | publisher `jmbarzee` | `OVSX_TOKEN` |
| npm | scope `@temporal-architect` (claimed for visualizer) | `NPM_TOKEN` (reused for `@temporal-architect/twf*`) |
| GitHub Releases | repo `jmbarzee/temporal-architect` | (built-in `GITHUB_TOKEN`) |

### Pending (block next tag push on the new channels)

| Channel | What to register | GitHub secret | One-time setup |
|---|---|---|---|
| **PyPI** | Create account at pypi.org. Reserve `twf-cli` (or chosen alternative) by publishing v0.0.0 or first real release. | `PYPI_TOKEN` (API token from pypi.org → Account settings → API tokens; scope to the project once reserved) | Account verification (email), 2FA strongly recommended, optional TestPyPI account for dry-runs. |
| **Homebrew tap** | Create `jmbarzee/homebrew-twf` (or matching the chosen tap pattern). Push one initial `Formula/twf.rb` (any version is fine; first `bump-brew` run overwrites). | `HOMEBREW_TAP_TOKEN` (PAT with `repo` write scope on the tap repo) | One-time `brew tap-new jmbarzee/twf` locally → push. |

### Post-M2

| Channel | What to register | Notes |
|---|---|---|
| Smithery MCP registry | Submit MCP server at smithery.ai/new with the install line. Optionally `/.well-known/mcp/server-card.json` in the repo for auto-extraction. | Free; no secret needed (Smithery proxies/lists). |

### Final secrets table

What `release.yml`'s reusable workflows expect, in one place:

| Secret | Used by | Required for | Source |
|---|---|---|---|
| `VSCE_TOKEN` | `_publish-vsix.yml` | every release | VS Code Marketplace publisher dashboard |
| `OVSX_TOKEN` | `_publish-vsix.yml` | every release | open-vsx.org publisher dashboard |
| `NPM_TOKEN` | `_publish-npm-twf.yml`, `_publish-npm-visualizer.yml` | every release | npmjs.com → Access Tokens → "Automation" type |
| `PYPI_TOKEN` | `_publish-pypi.yml` | every release | pypi.org → Account settings → API tokens |
| `HOMEBREW_TAP_TOKEN` | `_publish-brew.yml` | every release | github.com → Settings → Developer settings → PAT (`repo` scope on `<owner>/homebrew-twf`) |

Missing secrets fail the corresponding job with a clear "Error: <SECRET> not set" message; other jobs proceed independently.

### Rename impact on registrations

When the brand rename ships, the following need re-registering on top of the coordinate updates above:

| Item | Action |
|---|---|
| npm scope | `npm org create <new-scope>`. Add publishing user as admin. Existing `NPM_TOKEN` works if same user; otherwise generate new. |
| PyPI package | Register new package name. New `PYPI_TOKEN` scoped to new project. |
| VS Code Marketplace publisher | If publisher itself renames: new account at dev.azure.com → new `VSCE_TOKEN`. Otherwise just `package.json` update. |
| Open VSX publisher | Same as VS Code Marketplace. |
| Homebrew tap repo | If owner changes: new tap repo; new `HOMEBREW_TAP_TOKEN`. |
| Smithery | Re-submit with new install line; deprecate old. |

The existing `@temporal-architect/visualizer` package on npm becomes a deprecated tombstone if the brand renames. Same dynamic for VS Code Marketplace and Open VSX extensions if publisher/extension IDs change. No way to forward-migrate installs at the registry layer.

---

## Suggested sequencing

1. **M1** (~1 day). Mechanical, mirrors `tools/spec/` pattern. New module lands at `tools/skills/`.
2. **M2** (~2-3 days). Pick MCP library; build server + tools/resources/prompts; verify with real MCP client.
3. **M4** (~2 days). `twf init` scaffolder — depends on M1's embedded skills.
4. **External account setup** — can happen any time; gates M5.
5. **M5** when brand is decided and accounts exist. Walk Rename inventory + flip publishing.
6. **M6** if there's appetite for a docs site.

Total remaining: ~5-7 focused-developer days plus the brand-rename event.

---

## What we are explicitly *not* doing

- No hosted MCP server (local-only over stdio).
- No paid domain or hosted docs site (Pages only, if anything).
- No telemetry (no infrastructure to receive it).
- No skill registry of our own (we list on the ecosystem's: Smithery, Claude Code marketplaces, Cursor's auto-discovery, agentskills.io if that materializes).
- No backwards-compat shims for pre-v1 contracts (per AGENTS.md).

---

## References

- [Model Context Protocol — Specification](https://modelcontextprotocol.io/specification/latest)
- [Anthropic Agent Skills — Specification](https://agentskills.io/specification)
- [Cursor Docs — Agent Skills](https://cursor.com/docs/skills)
- [Claude Code Docs — Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [AGENTS.md](https://agents.md/)
- [Smithery — Publish an MCP server](https://smithery.ai/docs/build/publish)
- [mark3labs/mcp-go](https://github.com/mark3labs/mcp-go)
- [modelcontextprotocol/go-sdk](https://github.com/modelcontextprotocol/go-sdk)
- [Distributing Platform-Specific Binaries with npm](https://www.magicbell.com/blog/distributing-platform-specific-binaries-with-npm)
- [Homebrew — Create and Maintain a Tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap)
