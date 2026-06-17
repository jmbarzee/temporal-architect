# packages/

After the distribution split, the toolchain repo keeps only the **canonical
release surface** that must live where the GitHub Release is cut:

| Path | Channel | Audience |
|---|---|---|
| [`install.sh`](./install.sh) | Curl-bash one-liner | Anything POSIX with no package manager (Docker, minimal CI, dotfiles) |

`install.sh` is a thin downloader for the toolchain's GitHub Release assets
(`twf-vX.Y.Z-<os>-<arch>.{tar.gz,zip}` + `SHA256SUMS`). It must ship where the
Release is cut, so it stays here.

## Everything else moved to the distribution repo

The VS Code/Cursor extension (VSIX), the npm wrapper + platform sub-packages,
the PyPI wheel, the Claude Code plugin payload + marketplace catalog, and the
Homebrew formula bumper now live in
[`jmbarzee/temporal-architect-dist`](https://github.com/jmbarzee/temporal-architect-dist).
That repo **consumes** this repo's GitHub Release assets (binary archives,
skills tarball, visualizer lib/webview, wire-types) and publishes every
shippable package. See the toolchain [`README.md`](../README.md#how-it-ships)
for the two-repo topology.
