# internal/

**Dev-only tooling.** Nothing here ships to users — these are the
tools, designs, and helpers used to *build, release, and maintain*
the project itself.

For *what does ship*, see [`tools/`](../tools/) (source). The registry packaging
surfaces (and the `bump-brew` formula tool) live in the distribution repo
(`jmbarzee/temporal-architect-dist`); this repo only cuts the GitHub Release.

## Layout

| Path | Purpose |
|---|---|
| [`release/gen-skills-manifest/`](./release/gen-skills-manifest/) | Go tool — emits `skills/MANIFEST.md` and the `skills-vX.Y.Z.tar.gz` release asset |
| [`harness/`](./harness/) | `components.md` — the dev-cycle component manifest (graph, scopes, review mappings, propagation routing). Consumed by the `/dev-cycle` skill (`.claude/skills/dev-cycle/`, the agent-loop runtime) and the orchestrator. Pairs with [`changes/`](./changes/) |
| [`orchestrator/`](./orchestrator/) | `.twf` design of the automated dev-cycle Temporal workflow (review → execute → propagate) — the durable twin of the `/dev-cycle` skill. Pairs with [`changes/`](./changes/) |
| [`version.sh`](./version.sh) | Shell helper for `make release` — computes the next semver from `git describe` |

## Why `internal/`

The name is borrowed from Go's convention for "not importable from
outside this module." That's literally true for the Go modules under
`release/` — nothing in [`tools/`](../tools/) imports them, and they
never become part of any shipped artifact.

The non-Go contents (`harness/components.md`, `orchestrator/dev-cycle.twf`, `version.sh`) follow
the same spirit: they're things only people developing this repo touch,
never things downstream consumers see.

## Adding a new dev-only tool

Go module → drop it under `internal/release/<name>/` (single Go module
per tool — `go.mod`, `main.go`, `main_test.go` — wired into
[`go.work`](../go.work)'s `use` list).
Other tooling → at `internal/<name>` if it doesn't fit the release-tool
shape.
