# temporal-skills

A DSL (`.twf`) and toolchain for designing, visualizing, and code-generating Temporal workflows. See [README](./README.md) for full details.

## Project Layout

```
tools/lsp/              Go parser, resolver, validator, LSP server
  parser/token/         Token types and lexer vocabulary
  parser/lexer/         Indentation-aware lexer
  parser/parser/        Recursive-descent parser → AST
  parser/ast/           AST node types, JSON serialization, walker
  parser/resolver/      Name resolution (string refs → pointers)
  internal/server/      LSP server (hover, completions, diagnostics, etc.)
  cmd/twf/              CLI binary (check, parse, symbols, lsp)
tools/visualizer/       React + TypeScript webview (Tree View, Graph View)
tools/orchestrator/     Temporal workflow spec for automated dev-cycle
packages/               VS Code / Cursor extension
skills/                 AI skill definitions (design, author-go)
changes/                Ephemeral coordination files (REVISIONS + CHANGES per component)
```

## Project Status

This project is **pre-v1 and in active greenfield development**. The priority is elegant, correct representation — not stability.

**Breaking changes are expected and welcome.** Do not waste effort on backwards compatibility shims, deprecated field aliases, or migration paths. When a better design emerges, adopt it directly.

**Document breaking changes** in `AST_REVISIONS.md` so the visualizer team can propagate changes to the TypeScript layer. The parser's JSON output is the contract between Go and TypeScript — when it changes, both sides update together.

The current revision plan is tracked in [`AST_REVISIONS.md`](./AST_REVISIONS.md).

## Dependency Map

Changes propagate downstream along this graph. Each edge has a named contract:

```
DSL grammar (tools/lsp/LANGUAGE_SPEC.md)
  └─► Parser (tools/lsp/)
        │  contract: token types, AST node types, resolver error model
        ├─► LSP Server (tools/lsp/internal/server/)
        │     contract: Go AST types + resolver API (same module)
        ├─► Visualizer (tools/visualizer/)
        │     contract: JSON output of `twf parse` and `twf symbols`
        ├─► Skill: Design (skills/design/)
        │     contract: DSL syntax and semantics as in LANGUAGE_SPEC.md
        │     └─► Skill: Author-Go (skills/author-go/)
        │           contract: Design skill semantics + Temporal Go SDK mapping
        └─► VS Code Extension (packages/vscode/)
              contract: LSP protocol responses + JSON output
```

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
| `review-alignment-parser` | Align parser implementation to `LANGUAGE_SPEC.md` |
| `review-alignment-parser-visualizer` | Align visualizer to parser JSON contract |
| `review-alignment-visualizer` | Align visualizer implementation to visualizer spec |
| `review-alignment-design-skill` | Align design skill to parser (constructs, errors, AST) |
| `review-alignment-author-skills` | Align author-go skill to design skill and Temporal SDK |
| **Execution & Propagation** | |
| `address-review` | Execute an approved review group (inner loop) |
| `propagate-changes` | Fan out downstream reviews from a completed CHANGES file |
| `summarize-changes` | Scan `changes/` and produce consolidated report |
| **Design Ideation** | |
| `expand-idea` | Expand a one-sentence idea into a full Temporal architecture vision with draft `.twf` |

**Start here for a new cycle:** `/project:dev-cycle`
**Start here for targeted work:** pick the specific review command for the layer you're focused on.
**Start here for a new design:** `/project:expand-idea`
