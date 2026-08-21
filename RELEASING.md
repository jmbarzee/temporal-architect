# Releasing

The **git tag is the single source of truth** for a release. Cutting a release
is one action — pushing a `vX.Y.Z` tag on a `main` commit. Everything else is
derived from that tag in CI; no version is committed to the repo.

## Cut a release

From an up-to-date checkout of `main`:

```bash
make release-minor   # 0.12.0 -> 0.13.0   (pre-v1: default; breaking changes ship as minor)
make release-patch   # 0.12.0 -> 0.12.1
make release VERSION=0.13.0   # explicit version
```

This computes the next version from the latest tag, verifies your commit is on
`origin/main`, then tags it and pushes the tag. It does **not** create a commit
or modify `main`. The `v*` tag push triggers `.github/workflows/release.yml`.

> Stay on `0.x`. Never run `make release-major` or pass `VERSION=1.x.x` until the
> team deliberately cuts `v1.0.0` (see AGENTS.md → Project Status).

## How versions are assigned (all at build time, from the tag)

| Artifact | Version source |
|---|---|
| `twf` binary | `-ldflags` / `git describe`, then build-info fallback |
| skills tarball | `--version` passed from the tag |
| visualizer + wire-types npm | `npm version <tag>` stamped in CI before `npm pack` |
| module tags (`tools/spec`, `tools/lsp`) | fanned out from the tag by `_tag-modules.yml` |
| dist repo packages | the version in the dispatch payload |

The two npm `package.json` files carry a `0.0.0-dev` placeholder that is **never
published** — CI overwrites it from the tag at pack time (the edit lives only in
the CI workspace). Because no version is committed, a version can never drift out
of sync with the tag.

## The release guard

`_release-guard.yml` runs first and every build/publish job depends on it, so a
bad tag publishes nothing. It fails the release if:

- the tag is not a valid `vX.Y.Z`, or
- the tagged commit is not on `origin/main`.

`make release` mirrors the on-main check locally, but the CI guard is
authoritative (a hand-pushed tag is still caught there).

## Verifying a release

After the workflow runs for `vX.Y.Z`:

1. `@temporal-architect/visualizer@X.Y.Z` and `@temporal-architect/wire-types@X.Y.Z`
   are on npm (with provenance).
2. The GitHub Release `vX.Y.Z` exists with the twf binary + skills tarballs.
3. `tools/spec/vX.Y.Z` and `tools/lsp/vX.Y.Z` tags exist at the release commit,
   and `go install …/tools/lsp/cmd/twf@vX.Y.Z` prints `X.Y.Z`.
4. The dist repo received the `toolchain-release` dispatch.
