# temporal-skills

A DSL (`.twf`) and toolchain for designing, visualizing, and code-generating Temporal workflows. See [README](./README.md) for full details.

## Project Layout

See [README — Repository Structure](./README.md#repository-structure) for the top-level tree. Additional internal detail relevant to working in this repo:

```
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
  parser/deps/          Dependency graph extraction
  internal/server/      LSP server (hover, completions, diagnostics, etc.)
  cmd/twf/              CLI binary (check, parse, symbols, deps, spec, lsp)
scripts/
  gen-skills-manifest/  Go tool that emits skills/MANIFEST.md + release tarball
  install.sh            One-shot installer for the twf CLI + skills
  version.sh            Release version bump helper
changes/                Ephemeral coordination files (REVISIONS_NNN + CHANGES_NNN per component)
go.work                 Workspace wiring tools/lsp, tools/spec, and scripts/gen-skills-manifest
```

## Project Status

This project is **pre-v1 and in active greenfield development**. The priority is elegant, correct representation — not stability.

**Breaking changes are expected and welcome.** Do not waste effort on backwards compatibility shims, deprecated field aliases, or migration paths. When a better design emerges, adopt it directly.

**Coordinate breaking changes through the `changes/` directory.** Each component (`changes/dsl/`, `changes/parser/`, `changes/visualizer/`, `changes/orchestrator/`, `changes/design-skill/`, `changes/author-go-skill/`) owns a numbered series of `REVISIONS_NNN.md` (planned work) and `CHANGES_NNN.md` (completed work). The automated dev cycle drives this flow — see the [Development Commands](#development-commands) below, with `/project:dev-cycle` as the entry point and `/project:propagate-changes` for fanning a completed change out to downstream consumers.

Long-lived backlog and research docs that aren't per-cycle revisions live at the repo root (e.g. `POSSIBLE_DSL_FEATURES.md`, `VISUALIZER_DEFERRED.md`, `SKILL_IMPROVEMENTS.md`, `issues_blocking_downstream_adoption.md`, `packaging_and_distribution_research.md`).

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
        ├─► Skill: Design (skills/design/)
        │     contract: DSL syntax and semantics as in tools/spec/sections/
        │     └─► Skill: Author-Go (skills/author-go/)
        │           contract: Design skill semantics + Temporal Go SDK mapping
        └─► VS Code Extension (packages/vscode/)
              contract: LSP protocol responses + JSON output
```

The spec is consumed three ways: (1) as embedded content via `twf spec [--list|<slug>]`, (2) as files in `tools/spec/sections/` for skill prompts and review commands, and (3) as the importable Go package `github.com/jmbarzee/temporal-skills/tools/spec`.

When a layer changes, the contracts it exposes determine what needs to update downstream. AST field renames and JSON schema changes are the most common sources of cascading work.

## Development Commands

These project commands drive the development loop. Invoke with `/project:<name>`:

| Command | Purpose |
|---------|---------|
| `dev-cycle` | Scope and launch reviews → write REVISIONS to `changes/` |
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
| `summarize-changes` | Scan `changes/` and produce consolidated report |
| **Skill Authoring** | |
| `reflect-skill` | Reflect on a recent task and propose updates to the responsible skill |
| **Design Ideation** | |
| `expand-idea` | Expand a one-sentence idea into a full Temporal architecture vision with draft `.twf` |

**Start here for a new cycle:** `/project:dev-cycle`
**Start here for targeted work:** pick the specific review command for the layer you're focused on.
**Start here for a new design:** `/project:expand-idea`
