# temporal-architect

A toolchain for designing, visualizing, and code-generating entire Temporal systems — namespaces, workers, workflows, and Nexus — with `.twf` as the parseable source of truth. See [README](./README.md) for full details.

## North Star

`.twf` exists to **extend the complexity horizon of AI execution** — to let AI work at *system* scale, not code scale. The largest gains in AI-assisted development came from wiring AIs into **deterministic tooling** (compilers, linters, testers); temporal-architect is that deterministic harness for **Temporal architecture**. It keeps the AI out of the weeds — error handling, library choices, application-code pedantics — so it can focus on the large scale: **workloads, scaling, reliability, availability**. The product is a **context-protecting harness for the main agent**: fit bigger problems into the same context window.

Every change in this repo should serve that. Prefer designs that protect context and raise the level of abstraction the agent operates at; be wary of anything that drags the AI back down into code-scale busywork. (The "main agent" isn't always the *design* agent — sometimes it's authoring or reverse-engineering. Don't assume.)

## Running `go`

Prefix every Go command with `GOMODCACHE=$HOME/go/pkg/mod` (e.g. `GOMODCACHE=$HOME/go/pkg/mod go test ./...`). The Cursor agent sandbox injects a broken `GOMODCACHE` that can't resolve the temporary `tliron/glsp => jmbarzee/glsp` replace, so Go fails with `no required module provides package github.com/tliron/glsp` for the `tools/lsp` packages; the override points Go at the host cache (allowlisting `go` alone doesn't help — the bad var is still injected, and this is unrelated to `go.work`). Don't "fix" it by editing `go.mod`/`go.work`/`go.sum` or touching the replace — they're correct. Remove this paragraph once the upstream `tliron/glsp` PR lands and the replace is dropped.

## Project Layout

See [README — How it ships](./README.md#how-it-ships) for the two-repo topology. This
repo is the **toolchain** (engine + language + rendering source); everything a user
installs is **packaged** in the separate distribution repo
(`jmbarzee/temporal-architect-dist`). The dividing line is **library vs. distribution**,
not which registry a package lands on: a *library* (a build input with an API contract)
is published by the repo that owns its identity, so the toolchain publishes its own npm
libraries (`visualizer`, `wire-types`) and the `spec` Go module, while dist owns every
*end-user consumption model* (CLI wrappers, VSIX, claude-plugin, PyPI, Homebrew). The
toolchain also cuts a GitHub Release of primitive artifacts that dist consumes at build
time. Additional internal detail relevant to working in this repo:

```
# Engine + language + rendering source
tools/spec/
  sections/             Per-topic markdown files (NN-slug.md) — the canonical grammar
  spec.go               //go:embed sections/*.md + Sections/Get/All API
tools/lsp/
  parser/token/         Token types and lexer vocabulary
  parser/lexer/         Indentation-aware lexer
  parser/parser/        Recursive-descent parser → AST
  parser/ast/           AST node types, JSON serialization, walker
  parser/resolver/      Name resolution (string refs → pointers)
  parser/validator/     Post-resolution semantic checks
  parser/graph/         Resolved deployment graph extraction
  internal/server/      LSP server (hover, completions, diagnostics, etc.)
  cmd/twf/              CLI binary (check, parse, symbols, deps, spec, lsp); owns the Go DTO layer
tools/wire-types/       TS projection of the JSON wire contract (tygo-generated from the DTOs); published to npm from here
tools/visualizer/       React workflow visualizer; built + published to npm from here (the VS Code webview bundle is built in the dist repo from this library)
skills/                 AI skill definitions (canonical source; cut into the skills release tarball)

# Dev — release tooling and dev-cycle apparatus
internal/release/
  gen-skills-manifest/  Go tool that emits skills/MANIFEST.md + release tarball
internal/changes/       Per-component coordination files: REVISIONS_NNN, CHANGES_NNN, and BACKLOG
internal/harness/       Dev-cycle component manifest (components.md), shared by the /dev-cycle skill and the orchestrator
internal/orchestrator/  Temporal workflow design for the automated dev cycle (the durable twin of the /dev-cycle skill)
internal/version.sh     Release version bump helper

go.work                 Workspace wiring tools/lsp, tools/spec, tools/sampler, and internal/release/gen-skills-manifest
```

**Packaging surfaces (VSIX, npm wrapper/sub-packages, PyPI wheel, Claude plugin payload +
`.claude-plugin/` catalog, Homebrew bumper) and all registry-publish workflows live in the
distribution repo, not here.** The visualizer and wire-types are *libraries* — built,
version-stamped, and **published to npm from here** (welded to the parser via
`make gen-types`/`check-types`); their `repository.url` points at this repo, so npm
provenance succeeds. The dist repo only **downloads** their Release tarballs to consume at
build time (VSIX type-check + the webview bundle it builds from the visualizer library).

## Project Status

This project is **pre-v1 and in active greenfield development**. The priority is elegant, correct representation — not stability.

**Breaking changes are expected and welcome.** Do not waste effort on backwards compatibility shims, deprecated field aliases, or migration paths. When a better design emerges, adopt it directly.

**Stay on `0.x` until a deliberate first major release.** While pre-v1, *every* release is a minor or patch bump — breaking changes ship as `0.x` **minor** bumps (the CHANGELOG history follows this: each new construct or breaking change is a minor bump). Never run `make release TYPE=major` or pass an explicit `VERSION=1.x.x` until the team explicitly decides to cut `v1.0.0`. The release tooling never crosses into `1.x` on its own — a major only happens if someone asks for it. The package release tag tracks the DSL version in `CHANGELOG.md`.

**Coordinate breaking changes through the `internal/changes/` directory.** Each component (`internal/changes/dsl/`, `internal/changes/parser/`, `internal/changes/visualizer/`, `internal/changes/orchestrator/`, `internal/changes/skills/`) owns three file types:

- `REVISIONS_NNN.md` — planned work for an active dev cycle
- `CHANGES_NNN.md` — completed work, consumed and archived
- `BACKLOG.md` — informal ideas and deferred features; not cycle-committed, just a place to drop thoughts

The automated dev cycle drives the REVISIONS/CHANGES flow — see the [Development Commands](#development-commands) below, with the `/dev-cycle` skill (`.claude/skills/dev-cycle/`) as the entry point and its `propagate-changes` step for fanning a completed change out to downstream consumers.

Long-lived reference docs that don't belong to a single component live at the repo root (e.g. `issues_blocking_downstream_adoption.md`, `ROADMAP.md` — the engine feature roadmap). Packaging/distribution docs (`packaging.md`, `publishing_setup.md`) live in the distribution repo (`jmbarzee/temporal-architect-dist`).

When the parser's JSON output changes, the Go DTO structs are the single source of truth: their TypeScript projection is generated into the `@temporal-architect/wire-types` package (`tools/wire-types`, via `make gen-types`, CI-gated by `make check-types`). The visualizer consumes it in-tree (`file:`); the VS Code extension (in the dist repo) consumes the **published, version-pinned** `@temporal-architect/wire-types@X.Y.Z` — so a DTO change reaches the extension as a version bump, not an in-repo edit. Only the hand-written residue (discriminated-union overlays + string-literal enums) is updated alongside.

## Dependency Map

The authoritative component graph — scopes, review mappings, propagation routing, and wave ordering — lives in `internal/harness/components.md`. Keep it there and only there.

The contract on each edge: the parser exposes token types, AST node types, and the resolver error model to the LSP server; the JSON output of `twf parse`/`twf symbols` to the visualizer; DSL syntax and semantics (per `tools/spec/sections/`) to the design skill, which in turn exposes Temporal Go SDK mappings to the author skills. The VS Code extension lives in the distribution repo and consumes the toolchain only across the published `@temporal-architect/wire-types` + visualizer release artifacts — a cross-repo version-pin seam, not an in-tree edge.

The spec is consumed three ways: (1) as embedded content via `twf spec [--list|<slug>]`, (2) as files in `tools/spec/sections/` for skill prompts and review commands, and (3) as the importable Go package `github.com/jmbarzee/temporal-architect/tools/spec`.

When a layer changes, the contracts it exposes determine what needs to update downstream. AST field renames and wire-contract (DTO) changes are the most common sources of cascading work; regenerate the wire types with `make gen-types`.

## Development Commands

The dev-cycle harness is a **skill** at `.claude/skills/dev-cycle/` (read by both Cursor and Claude Code), invokable as `/dev-cycle`. Its `SKILL.md` is the router and loop; the individual step prompts live in `.claude/skills/dev-cycle/references/` and are dispatched to subagents on demand. The graph they operate on is `internal/harness/components.md`.

| Step prompt (`.claude/skills/dev-cycle/references/<name>.md`) | Purpose |
|---------|---------|
| **Quality Reviews** | |
| `review-quality-parser` | Go parser, AST, resolver — code quality and design |
| `review-quality-visualizer` | Visualizer TypeScript — code quality and contract consumption |
| `review-quality-dsl-spec` | DSL design — coverage and representation against Temporal primitives |
| `review-quality-visualizer-spec` | Visualizer — product and UX against spec |
| `review-quality-skill` | Single skill — craft, focus, and information density |
| **Alignment Reviews** | |
| `review-alignment-parser` | Align parser implementation to `tools/spec/sections/` |
| `review-alignment-parser-visualizer` | Align visualizer to parser JSON contract |
| `review-alignment-visualizer` | Align visualizer implementation to visualizer spec |
| `review-alignment-design-skill` | Align design skill to parser (constructs, errors, AST) |
| `review-alignment-author-skills` | Align author-go / author-infra skills to design skill and Temporal SDK |
| **Execution & Propagation** | |
| `address-review` | Execute an approved review group (inner loop) |
| `propagate-changes` | Fan out downstream reviews from a completed CHANGES file |
| `summarize-changes` | Scan `internal/changes/` and produce consolidated report |

Two standalone helpers ship as their own **skills** under `.claude/skills/` (not part of the dev-cycle harness):

| Skill (`.claude/skills/<name>/SKILL.md`) | Purpose |
|---------|---------|
| `expand-idea` | Expand a one-sentence idea into a full Temporal architecture vision with draft `.twf` |
| `reflect-skill` | Reflect on a recent task and propose updates to the responsible skill |

**Start here for a new cycle:** invoke the `/dev-cycle` skill.
**Start here for targeted work:** use the dev-cycle skill's "review" entrypoint for the layer you're focused on.
**Start here for a new design:** use the `expand-idea` skill.
