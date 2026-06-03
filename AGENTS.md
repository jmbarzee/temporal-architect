# temporal-architect

A DSL (`.twf`) and toolchain for designing, visualizing, and code-generating Temporal workflows. See [README](./README.md) for full details.

## Project Layout

See [README — Repository Structure](./README.md#repository-structure) for the top-level tree. Additional internal detail relevant to working in this repo:

The top-level layout splits **distribution** (what users receive) from **dev** (what builds and maintains it). Two paths are at the root because external tools dictate the location: `.claude-plugin/` (Claude Code marketplace) and `.claude/` (Claude Code config).

```
# Distribution source
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
  cmd/twf/              CLI binary (check, parse, symbols, deps, spec, lsp)
tools/visualizer/       React workflow visualizer (npm package + VSIX webview)
skills/                 AI skill definitions (canonical source; bundled into VSIX and the Claude Code plugin npm package at build time)

# Distribution artifacts (per channel)
packages/npm/twf*/      `@temporal-architect/twf` wrapper + 5 platform sub-packages
packages/npm/claude-plugin/  `@temporal-architect/claude-plugin` (Claude Code plugin payload; skills/ is gitignored, copied at build time)
packages/pypi/twf-cli/  `twf-cli` PyPI wheel (one per platform)
packages/vscode/        VS Code / Cursor / Open VSX extension (VSIX)
packages/install.sh     Curl-bash installer (no package manager required)
.claude-plugin/         Single-file Claude Code marketplace catalog (path forced by Claude Code; payload ships from packages/npm/claude-plugin/)

# Dev — release tooling and dev-cycle apparatus
internal/release/
  gen-skills-manifest/  Go tool that emits skills/MANIFEST.md + release tarball
  bump-brew/            Go tool that bumps the Homebrew tap formula on release
internal/changes/       Per-component coordination files: REVISIONS_NNN, CHANGES_NNN, and BACKLOG
internal/orchestrator/  Temporal workflow design for the automated dev cycle
internal/version.sh     Release version bump helper

go.work                 Workspace wiring tools/lsp, tools/spec, and internal/release/*
```

## Project Status

This project is **pre-v1 and in active greenfield development**. The priority is elegant, correct representation — not stability.

**Breaking changes are expected and welcome.** Do not waste effort on backwards compatibility shims, deprecated field aliases, or migration paths. When a better design emerges, adopt it directly.

**Stay on `0.x` until a deliberate first major release.** While pre-v1, *every* release is a minor or patch bump — breaking changes ship as `0.x` **minor** bumps (the CHANGELOG history follows this: each new construct or breaking change is a minor bump). Never run `make release TYPE=major` or pass an explicit `VERSION=1.x.x` until the team explicitly decides to cut `v1.0.0`. The release tooling never crosses into `1.x` on its own — a major only happens if someone asks for it. The package release tag tracks the DSL version in `CHANGELOG.md`.

**Coordinate breaking changes through the `internal/changes/` directory.** Each component (`internal/changes/dsl/`, `internal/changes/parser/`, `internal/changes/visualizer/`, `internal/changes/orchestrator/`, `internal/changes/design-skill/`, `internal/changes/author-go-skill/`) owns three file types:

- `REVISIONS_NNN.md` — planned work for an active dev cycle
- `CHANGES_NNN.md` — completed work, consumed and archived
- `BACKLOG.md` — informal ideas and deferred features; not cycle-committed, just a place to drop thoughts

The automated dev cycle drives the REVISIONS/CHANGES flow — see the [Development Commands](#development-commands) below, with `/project:dev-cycle` as the entry point and `/project:propagate-changes` for fanning a completed change out to downstream consumers.

Long-lived reference docs that don't belong to a single component live at the repo root (e.g. `issues_blocking_downstream_adoption.md`, `packaging.md`).

When the parser's JSON output changes, both the Go and TypeScript sides update together; that contract is what every downstream consumer (visualizer, VS Code extension, skills) reads.

## Dependency Map

Changes propagate downstream along this graph. Each edge has a named contract:

```
DSL grammar (tools/spec/sections/*.md)
  └─► Parser (tools/lsp/)
        │  contract: token types, AST node types, resolver error model
        ├─► LSP Server (tools/lsp/internal/server/)
        │     contract: Go AST types + resolver API (same module)
        ├─► Visualizer (tools/visualizer/)
        │     contract: JSON output of `twf parse` and `twf symbols`
        ├─► Skill: Design (skills/temporal-architect-design/)
        │     contract: DSL syntax and semantics as in tools/spec/sections/
        │     └─► Skill: Author-Go (skills/temporal-architect-author-go/)
        │           contract: Design skill semantics + Temporal Go SDK mapping
        └─► VS Code Extension (packages/vscode/)
              contract: LSP protocol responses + JSON output
```

The spec is consumed three ways: (1) as embedded content via `twf spec [--list|<slug>]`, (2) as files in `tools/spec/sections/` for skill prompts and review commands, and (3) as the importable Go package `github.com/jmbarzee/temporal-architect/tools/spec`.

When a layer changes, the contracts it exposes determine what needs to update downstream. AST field renames and JSON schema changes are the most common sources of cascading work.

## Development Commands

These project commands drive the development loop. Invoke with `/project:<name>`:

| Command | Purpose |
|---------|---------|
| `dev-cycle` | Scope and launch reviews → write REVISIONS to `internal/changes/` |
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
| `review-alignment-author-skills` | Align author-go skill to design skill and Temporal SDK |
| **Execution & Propagation** | |
| `address-review` | Execute an approved review group (inner loop) |
| `propagate-changes` | Fan out downstream reviews from a completed CHANGES file |
| `summarize-changes` | Scan `internal/changes/` and produce consolidated report |
| **Skill Authoring** | |
| `reflect-skill` | Reflect on a recent task and propose updates to the responsible skill |
| **Design Ideation** | |
| `expand-idea` | Expand a one-sentence idea into a full Temporal architecture vision with draft `.twf` |

**Start here for a new cycle:** `/project:dev-cycle`
**Start here for targeted work:** pick the specific review command for the layer you're focused on.
**Start here for a new design:** `/project:expand-idea`
