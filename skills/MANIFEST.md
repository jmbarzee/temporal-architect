# Skills Bundle Manifest

Each `v*` release of `temporal-skills` attaches a deterministic tarball of
the `skills/` tree as a GitHub Release asset, so downstream consumers
(prompt builders, doc tooling, non-Go runtimes) can pin a single archive +
checksum instead of vendoring individual files or scraping raw GitHub URLs.

This document is the stable contract for that bundle.

## Asset names

```
skills-vX.Y.Z.tar.gz          # the bundle (always gzipped tar)
SHA256SUMS                    # checksum file shared with the twf binaries
```

The `SHA256SUMS` file is the same one that pins the `twf-*` binaries, so
verification flows uniformly:

```bash
grep "skills-vX.Y.Z.tar.gz" SHA256SUMS | sha256sum --check
```

## Tarball layout

The tarball reproduces the repo's `skills/` directory verbatim, with one
addition — a `MANIFEST.json` at the root:

```
skills/
  MANIFEST.json
  design/
    SKILL.md
    reference/...
    topics/...
  author-go/
    SKILL.md
    reference/...
```

The top-level directory is always `skills/`. Untar in place to drop the
tree at any location.

## `MANIFEST.json` schema

```json
{
  "version":     "v0.3.0",
  "root":        "skills",
  "file_count":  60,
  "total_bytes": 280417,
  "files": [
    {
      "path":   "design/SKILL.md",
      "size":   9150,
      "sha256": "b871ea8b982130d282c5578d2847b319525f87bc8a9dec98cf23fcc2b0819be3"
    }
  ]
}
```

### Field semantics

| Field         | Type    | Notes                                                                |
|---------------|---------|----------------------------------------------------------------------|
| `version`     | string  | Matches the Git tag (e.g. `v0.3.0`); is the `--version` flag value.  |
| `root`        | string  | Top-level directory inside the tarball. Always `"skills"`.           |
| `file_count`  | integer | Number of entries in `files`.                                        |
| `total_bytes` | integer | Sum of `size` across all files. Excludes `MANIFEST.json` itself.     |
| `files`       | array   | Sorted lexicographically by `path`. Excludes `MANIFEST.json`.        |
| `files[].path`   | string  | Forward-slash, relative to `root` (e.g. `"design/SKILL.md"`).     |
| `files[].size`   | integer | File size in bytes.                                                |
| `files[].sha256` | string  | Lowercase-hex SHA-256 of the file's raw bytes.                    |

`MANIFEST.json` does not include an entry for itself. This keeps the
schema's hash → file-content invariant trivially verifiable without
solving a fixed-point equation.

## Determinism guarantees

- File entries in `MANIFEST.json` are sorted by `path` (lexicographic).
- Tar headers use a fixed mtime (Unix epoch), uid/gid 0, mode 0644 for
  regular files and 0755 for directories, and PAX format.
- The gzip header is written without an embedded filename or timestamp.
- Two runs over the same source bytes (and same `--version`) produce
  byte-identical archives — and therefore identical `SHA256SUMS` entries.

This makes the bundle safe to checksum-pin in lockfiles and CI caches.

## Verification snippet

```bash
# Download once
curl -sSfLO https://github.com/jmbarzee/temporal-skills/releases/download/vX.Y.Z/skills-vX.Y.Z.tar.gz
curl -sSfLO https://github.com/jmbarzee/temporal-skills/releases/download/vX.Y.Z/SHA256SUMS

# Verify tarball
grep "skills-vX.Y.Z.tar.gz" SHA256SUMS | sha256sum --check

# Extract and verify every file against its manifest entry
tar -xzf skills-vX.Y.Z.tar.gz
( cd skills && jq -r '.files[] | "\(.sha256)  \(.path)"' MANIFEST.json \
  | sha256sum --check )
```

A non-zero exit from either `sha256sum --check` means the bundle was
tampered with or built non-reproducibly — fail closed.

## Producing the bundle locally

```bash
make build-skills-archive VERSION=0.3.0          # → dist/skills-v0.3.0.tar.gz
make build-skills-archive VERSION=v0.3.0         # equivalent
```

The generator lives at `internal/release/gen-skills-manifest/`. It walks `skills/`,
computes hashes, and writes the archive — no third-party deps beyond
the Go standard library.
