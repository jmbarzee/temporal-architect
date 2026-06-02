# Publishing & Distribution Setup

Actionable rollout for getting every distribution channel from "wired in CI" to "verified end-to-end on the public registry." Pair with [`packaging.md`](./packaging.md) for design rationale and the [channel matrix in the README](./README.md#packaging--distribution) for what's shipping where.

## Status snapshot

| Channel | CI wired | Account / token | First publish landed | Notes |
|---|---|---|---|---|
| VS Code Marketplace (`jmbarzee.twf-syntax`) | yes | yes (`VSCE_TOKEN`) | yes — last shipped `v0.3.2` | **Listing's "View Source" link 404s today** because `package.json` `repository.url` points at `github.com/jmbarzee/temporal-architect` but the repo is still at `jmbarzee/temporal-skills`. Resolves the moment the repo is renamed (next item). |
| Open VSX (`jmbarzee/twf-syntax`) | yes | yes (`OVSX_TOKEN`) | yes — last shipped `v0.3.2` | Same "View Source" caveat as VS Code Marketplace. |
| GitHub Release assets (`twf-*`, `skills-*`, `install.sh`, `SHA256SUMS`) | yes | (built-in) | **partial** — `v0.3.2` shipped only VSIX files; the binary archive + skills tarball + install.sh wiring landed after `v0.3.2`. First end-to-end run will be the next `v*` tag. |
| npm `@temporal-architect/visualizer` | yes (`_publish-npm-visualizer.yml`) | yes (`NPM_TOKEN`, scope claimed) | no | First publish happens on next tag. |
| npm `@temporal-architect/twf` + 5 platform sub-packages | yes (`_publish-npm-twf.yml`) | yes (`NPM_TOKEN`, scope claimed) | no | First publish happens on next tag. **6 packages publish atomically per tag**; if any sub-package publish fails the wrapper's `optionalDependencies` resolution breaks for that platform. |
| npm `@temporal-architect/claude-plugin` | yes (`_publish-npm-claude-plugin.yml`) | yes (`NPM_TOKEN`) | no | Claude Code marketplace plugin payload. |
| PyPI `twf-cli` (5 wheels) | yes (`_publish-pypi.yml`) | **no** (`PYPI_TOKEN` missing) | no | Account creation + package name reservation + secret pending. See [§ External accounts](#external-accounts). |
| Homebrew tap `jmbarzee/homebrew-twf` | yes (`_publish-brew.yml`) | **no** (`HOMEBREW_TAP_TOKEN` missing, tap repo not created) | no | Tap repo creation + initial `Formula/twf.rb` + secret pending. |
| Claude Code marketplace (`/plugin install temporal-architect@temporal-architect`) | n/a (resolved from GitHub) | (uses `GITHUB_TOKEN`) | no | Becomes reachable the moment the GitHub repo rename lands (or via the redirect, for a year). |
| Smithery MCP registry | n/a (manual) | n/a | n/a | Post-M2. |

Legend: "wired in CI" = a `_publish-*.yml` reusable workflow exists and is called from `release.yml`; "first publish landed" = the artifact actually exists on the public registry under the current name.

## What blocks what

```
GitHub repo rename (jmbarzee/temporal-skills → jmbarzee/temporal-architect)
  ├── unblocks: marketplace "View Source" links, install.sh URLs, all `go install` URLs in error messages
  └── safe to do immediately — see § 1

External account setup (PyPI + Homebrew tap)
  ├── unblocks: `_publish-pypi.yml`, `_publish-brew.yml`
  └── safe to do in parallel with rename — see § 2

First publish (any `v*` tag after the above)
  ├── unblocks: every "first publish landed: no" row above
  └── needs smoke tests per channel — see § 4
```

---

## 1. GitHub repo rename

This is the single highest-leverage move. All internal manifests already reference `github.com/jmbarzee/temporal-architect`; the GitHub repo itself is still at `jmbarzee/temporal-skills`. Until they match:

- The shipped VS Code extension's "View Source" link 404s.
- `go install github.com/jmbarzee/temporal-architect/...@latest` fails. The extension's missing-binary error message prints exactly this URL ([`packages/vscode/src/extension.ts:306`](./packages/vscode/src/extension.ts)).
- The Claude Code marketplace install line `/plugin marketplace add jmbarzee/temporal-architect` fails to resolve.
- Every README install snippet that pins a download URL fails.
- The JSON Schema `$id` (`tools/lsp/cmd/twf/twf.schema.json`) resolves to a non-existent URL.

### Action

Settings → General → Rename: `temporal-skills` → `temporal-architect`. GitHub auto-creates a redirect that survives for **1 year** of inactivity on the old name, but the cleanest path is to update the local clone immediately after:

```bash
git remote set-url origin git@github.com:jmbarzee/temporal-architect.git
git remote -v   # verify
```

### Verification gate

- [ ] `curl -sI https://github.com/jmbarzee/temporal-architect | head -1` returns `200`.
- [ ] `go install github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf@latest` succeeds in a clean shell.
- [ ] The marketplace listing's "Repository" link resolves.

### What this does **not** break

The VS Code / Cursor extension itself is unaffected at the *extension-ID* level — `jmbarzee.twf-syntax` is the same string before and after the repo rename. Installed users keep their extension; updates keep flowing. The only thing that changes is the URL the marketplace's "View Source" link sends a click to (currently 404, post-rename 200).

### What this **does** break (and how to handle)

| Surface | Break | Mitigation |
|---|---|---|
| Hardcoded `temporal-skills` URLs in old documentation, blog posts, AI-agent caches | 404 once GitHub's 1-year redirect lapses | GitHub redirect is automatic and lasts a year; that's enough time for the long tail to update. |
| Cloned forks tracking `temporal-skills` | `git fetch` still works via redirect | Communicate the rename in CHANGELOG; users `git remote set-url`. |
| Lingering `temporal-skills` references in `package-lock.json` and two `MANIFEST.md` build artifacts | None functionally, but they leak the old name | Rebuild the visualizer / claude-plugin and let `make build-skills` regenerate the MANIFEST files. The fix is mechanical, not load-bearing. |

If a future *brand* rename ever changes the extension publisher (`jmbarzee.*`) or extension name (`twf-syntax`), that is a fundamentally bigger break because VS Code Marketplace extension IDs are **immutable** — see [§ 5](#5-future-brand-rename-the-extension-id-change-scenario). That scenario is not triggered by the current repo rename.

---

## 2. External accounts (pending)

Both block their corresponding publish jobs. Both are independent and can be done in parallel.

### PyPI (`PYPI_TOKEN`)

1. Create an account at [pypi.org](https://pypi.org). Verify email; enable 2FA (required for new accounts).
2. (Optional) Mirror the account at [test.pypi.org](https://test.pypi.org) for dry-runs.
3. **Reserve the name `twf-cli`** by publishing `v0.0.0` from your local machine, or land it on the first real release:
   ```bash
   cd packages/pypi/twf-cli
   # Edit version to 0.0.0
   python -m build
   python -m twine upload dist/*    # interactively prompts for credentials
   ```
   Once reserved, the account is the package owner; CI can publish subsequent versions via token.
4. Generate an API token: pypi.org → Account settings → API tokens → **scoped to project `twf-cli`** (not account-wide).
5. Add to GitHub: Settings → Secrets and variables → Actions → New repository secret → name `PYPI_TOKEN`, value the full `pypi-...` string.

### Homebrew tap (`HOMEBREW_TAP_TOKEN`)

1. **Create the tap repo** on GitHub: `jmbarzee/homebrew-twf` (the `homebrew-` prefix is required by Homebrew convention).
2. **Push an initial empty formula** so the tap is discoverable:
   ```bash
   brew tap-new jmbarzee/twf
   # populates ./Formula/twf.rb with a stub
   cd "$(brew --repo jmbarzee/twf)"
   git remote add origin git@github.com:jmbarzee/homebrew-twf.git
   git push -u origin main
   ```
   The first `bump-brew` run overwrites the stub.
3. **Create a PAT for CI**: github.com → Settings → Developer settings → Personal access tokens → Fine-grained → Repository access: only `jmbarzee/homebrew-twf` → Repository permissions: Contents (Read and write).
4. Add to GitHub repo secrets (on `temporal-architect`, not the tap): name `HOMEBREW_TAP_TOKEN`, value the PAT.

### Verification gate

- [ ] `PYPI_TOKEN` and `HOMEBREW_TAP_TOKEN` visible in `temporal-architect` → Settings → Secrets and variables → Actions.
- [ ] `twf-cli` and `jmbarzee/homebrew-twf` exist on their respective public registries.

---

## 3. Pre-tag final cleanup

Bookkeeping that survives the rename but is worth doing once before the next `v*` tag.

- [ ] `package-lock.json` at the repo root — regenerate or delete; it's an empty stub that still references `temporal-skills`.
- [ ] `packages/vscode/skills/MANIFEST.md` — regenerated by `make build-skills`; verify the next build clears the `temporal-skills` reference.
- [ ] `packages/npm/claude-plugin/skills/MANIFEST.md` — same; cleared by `make build-claude-plugin`.
- [ ] CHANGELOG entry for the next version noting the GitHub repo rename and (eventually) first publish on PyPI / Homebrew / npm-twf / claude-plugin channels.

### Verification gate

- [ ] `rg "temporal-skills" --type-add 'md:*.md' --type-add 'json:*.json' --type-add 'toml:*.toml' -t md -t json -t toml -t go` returns no live references (only historical CHANGELOG mentions are OK).

---

## 4. First-publish verification (per channel)

After the next `v*` tag fires, each channel needs a real-world smoke test. CI green is necessary but not sufficient — the registry's resolution path is what matters.

| Channel | Smoke test | Pass criterion |
|---|---|---|
| **GitHub Release assets** | `curl -sSL https://github.com/jmbarzee/temporal-architect/releases/latest/download/install.sh \| bash` in a clean shell on macOS and Linux | `twf --version` prints the matching tag |
| **npm wrapper** | `npx -y @temporal-architect/twf check examples/order.twf` from a directory with no `node_modules` | exits 0; npm resolves the correct platform sub-package |
| **npm visualizer** | In a scratch Vite app, `npm install @temporal-architect/visualizer react react-dom` → `import { Visualizer }` → `tsc --strict` | types resolve; bundle includes externalized React |
| **npm claude-plugin** | `npm view @temporal-architect/claude-plugin version` matches the tag; `/plugin install temporal-architect@temporal-architect` in Claude Code shows the skills | plugin appears in Claude Code's plugin list with the right version |
| **PyPI** | In a clean venv: `pip install twf-cli==X.Y.Z` for each of the 5 platforms (via Docker for non-host platforms); `twf --version` | exits 0; reports the right version |
| **Homebrew** | `brew untap jmbarzee/twf 2>/dev/null; brew install jmbarzee/twf/twf` on a fresh macOS shell | `twf --version` prints the tag |
| **VS Code Marketplace** | Install `jmbarzee.twf-syntax` from a fresh VS Code profile; open a `.twf` file | LSP starts, diagnostics render, visualizer opens, skills appear under `~/.cursor/skills/temporal-{design,author-go}/` |
| **Open VSX** | Same, in Codium / Cursor with Open VSX registry configured | Same as VS Code Marketplace |
| **`go install`** | `GOBIN=/tmp/twf-test go install github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf@vX.Y.Z` | binary builds; `twf --version` reports the tag |

Failures here are typically credential-related (token scopes too narrow), name-reservation issues (package name not actually owned), or platform-specific wheel/sub-package gaps. The reusable workflows are designed so individual channel failures do not block other channels — see `packaging.md § C6`.

### Verification gate

- [ ] At least one passing smoke test per row above for the first post-rename `v*` tag.
- [ ] CHANGELOG updated to call out which channels went live on this tag.

---

## 5. Future brand rename — the extension-ID change scenario

The current GitHub repo rename does **not** change the extension ID. A separate, larger brand rename someday might — and that's the case the user flagged as breaking the VS Code / Cursor extensions. The mechanics:

- **VS Code Marketplace extension IDs are immutable.** `jmbarzee.twf-syntax` is the literal identifier installed users carry; you cannot rename it in-place. The marketplace API has no concept of "this extension moved."
- **Open VSX has the same constraint.**
- **Cursor consumes the VS Code Marketplace API**, so it inherits the same rule. There is no separate Cursor-side migration mechanism.

### What "breaks the vscode and cursor extensions" means concretely

If a future rename ever changes the *publisher* (`jmbarzee.*`) or the *extension name* (`twf-syntax`) — for example to `temporal-architect.twf` or `<new-publisher>.workflow-format` — then:

- The previously-installed extension stays installed forever (no auto-uninstall), but stops receiving updates.
- The new extension is a brand-new install from the user's perspective. No carryover of settings, of the bundled `twf` version on disk, of the auto-installed skills paths under `~/.cursor/skills/`, etc.
- Existing CI integrations that pin `jmbarzee.twf-syntax` continue to install the now-frozen old version unless they update.

### Migration playbook (only run when a brand rename is actually decided)

1. **Pre-stage the new publisher account** on dev.azure.com (VS Code Marketplace) and the new publisher on Open VSX. Generate new `VSCE_TOKEN` / `OVSX_TOKEN`.
2. **Publish the first version under the new ID** with a clear `displayName` and a README that opens with: "This replaces `jmbarzee.twf-syntax`. Uninstall the old one to avoid conflicts."
3. **Ship a final version under the old ID** that:
   - Sets `deprecated: true` in `packages/vscode/package.json` (the marketplace renders a deprecation banner).
   - In `activate()`, shows a one-time `vscode.window.showInformationMessage` with an "Install new extension" button that opens the marketplace URL for the new ID.
   - Disables further activation (return early from `activate()` after the prompt).
4. **Update every README and Quick-install row** to reference the new ID. Keep the old ID documented as "deprecated, install [new]" so search engines route users correctly.
5. **Do not unpublish the old extension** — users who don't read deprecation banners will still have a working (if frozen) install. Unpublishing strands them.

The same dynamic applies to:

- **npm `@temporal-architect/*`** — npm scope names are also effectively immutable for migration purposes (the package can be `npm deprecate`d but not transferred to a new scope without consumer action). If the npm scope changes, every package above republishes under the new scope and we deprecate the old.
- **PyPI `twf-cli`** — names are immutable. Same deprecate-and-republish dance, except PyPI's deprecation story is weaker (no banner, just `pip` complaints if you `yank` versions).
- **Homebrew tap** — easier: the tap repo can be renamed via GitHub; users re-tap.
- **VS Code Marketplace publisher itself** — if `jmbarzee` is the wrong publisher identity going forward, a new dev.azure.com publisher is required.

### Decisions to make *before* committing to a brand rename of the extension ID

| Decision | Why it matters |
|---|---|
| Does the publisher (`jmbarzee.*`) actually need to change? | If not, *no break*: `jmbarzee.twf-syntax` stays valid through every other rename. |
| Does the extension name (`twf-syntax`) actually need to change? | If not, *no break*: extension stays installable as `jmbarzee.twf-syntax` no matter what the GitHub repo or product name is. |
| Migration vs. deprecate-and-forget? | Migration costs ~1 day of authoring the deprecation flow above; deprecate-and-forget costs lost users. |

The current internal-rename to `temporal-architect` (Go modules, npm scope, repo URL) **does not** require either of those to change. The extension stays `jmbarzee.twf-syntax` indefinitely if we want it to. Treat the extension-ID rename as a separate, opt-in event, not a consequence of the current rename.

---

## 6. Sequencing

1. **Rename the GitHub repo** (§ 1). Lowest cost, highest cleanup leverage.
2. **In parallel: stand up the PyPI and Homebrew accounts** (§ 2).
3. **Pre-tag cleanup pass** (§ 3) — clear lingering `temporal-skills` strings, regenerate built artifacts.
4. **Cut the next `v*` tag.** Every reusable workflow fires; per-channel smoke-test (§ 4).
5. **Triage any first-publish failures** per channel and re-tag if needed.
6. **Post-M2: Smithery submission** (per `packaging.md`).
7. **Defer the extension-ID change scenario** (§ 5) until / unless a brand-level decision actually requires it.

The work above can plausibly land in one focused day plus a real-tag dry run; the only hard external dependency is account creation latency (PyPI verification + tap repo creation).
