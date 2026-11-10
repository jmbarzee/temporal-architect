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

Alongside the guard, `dist-credential` mints the dist-handoff token (below), so
a broken credential also publishes nothing. Fix it, then re-run the workflow.

## The dist handoff

The release's last job, `dispatch-dist` (`_dispatch-dist.yml`), waits for the
Release and the npm publish (a failed publish withholds the dispatch). The
publish job waits until npm serves both libraries, and a re-run skips a version
npm already serves. The dispatch then sends a `toolchain-release`
repository_dispatch to `jmbarzee/temporal-architect-dist`, which opens dist's
manifest-bump PR. It authenticates as a GitHub App, minting a short-lived
installation token per run, so no credential expires.

One-time setup:

1. Create an app at <https://github.com/settings/apps/new>: any name,
   homepage `https://github.com/jmbarzee/temporal-architect`, **Webhook →
   Active** unchecked, **Repository permissions → Contents: Read and write**
   (nothing else), installable **Only on this account**.
2. On the app's page, note the **Client ID** and **Generate a private key**
   (downloads a `.pem`).
3. **Install App** → `jmbarzee` → **Only select repositories** →
   `temporal-architect-dist`.
4. Store both on this repo, then delete the `.pem`:

   ```bash
   gh variable set DIST_APP_CLIENT_ID --repo jmbarzee/temporal-architect --body <client-id>
   gh secret set DIST_APP_PRIVATE_KEY --repo jmbarzee/temporal-architect < <key>.pem
   ```

To rotate the key, generate a new one (step 2), re-run the `gh secret set`
line, then delete the old key on the app's page.

Check the credential without releasing (mints a token, dispatches nothing):

```bash
gh workflow run _dispatch-dist.yml --repo jmbarzee/temporal-architect
```

If `dispatch-dist` fails after the Release is out, re-run that job, or open
the bump PR from dist directly:

```bash
gh workflow run prepare-release.yml --repo jmbarzee/temporal-architect-dist -f version=vX.Y.Z
```

## Verifying a release

After the workflow runs for `vX.Y.Z`:

1. `@temporal-architect/visualizer@X.Y.Z` and `@temporal-architect/wire-types@X.Y.Z`
   are on npm (with provenance).
2. The GitHub Release `vX.Y.Z` exists with the twf binary + skills tarballs.
3. `tools/spec/vX.Y.Z` and `tools/lsp/vX.Y.Z` tags exist at the release commit,
   and `go install …/tools/lsp/cmd/twf@vX.Y.Z` prints `X.Y.Z`.
4. The dist repo opened its `release/vX.Y.Z` manifest-bump PR.
