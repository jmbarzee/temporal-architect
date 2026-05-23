# packages/

**Distribution artifacts.** Everything in this directory is consumed
externally — by package managers, install scripts, or end-users
running `npx`/`pip`/`brew`/`curl`.

For the *source* that gets compiled into these artifacts, see
[`tools/`](../tools/). For *AI assets* that bundle alongside, see
[`skills/`](../skills/).

## Catalog of install paths

| Path | Channel | Audience |
|---|---|---|
| [`npm/twf/`](./npm/twf/) | `@temporal-skills/twf` (wrapper) | Node / JS / TS, MCP clients |
| [`npm/twf-{darwin-arm64,darwin-x64,linux-x64,linux-arm64,win32-x64}/`](./npm/) | Platform sub-packages | Resolved by npm via `optionalDependencies` |
| [`pypi/twf-cli/`](./pypi/twf-cli/) | PyPI wheel (one per platform) | Python ecosystem, spec-builder Temporal worker |
| [`vscode/`](./vscode/) | VSIX (VS Code Marketplace + Open VSX) | Cursor, VS Code, Codium |
| [`install.sh`](./install.sh) | Curl-bash one-liner | Anything POSIX with no package manager (Docker, minimal CI, dotfiles) |

The Claude Code marketplace plugin is a **fifth distribution surface**
that lives at [`/.claude-plugin/`](../.claude-plugin/) at the repo root,
not here, because Claude Code's marketplace mechanism requires that
exact path. Treat it as a sibling of `packages/` despite the location.

## Conventions

Each package's `package.json` / `pyproject.toml` is *both* the dev
manifest *and* the publish manifest (see
[`packaging.md` § Conventions](../packaging.md#conventions)).
The `Makefile`'s `release:` target bumps every version in lockstep.

## Build & publish

Local mirrors of every CI publish step — see [`Makefile`](../Makefile)
for the full list:

```bash
make build-twf-archive VERSION=X.Y.Z GOOS=... GOARCH=...
make build-pypi-wheel PLATFORM_TAG=...
make publish-npm-platform VSCE_TARGET=... GOOS=... GOARCH=...
make publish-pypi
make publish-brew VERSION=vX.Y.Z
```

The actual publishing happens via `.github/workflows/release.yml` on a
`v*` tag — see [`packaging.md` § Current state](../packaging.md#current-state)
for the phase-based reusable workflow layout.
