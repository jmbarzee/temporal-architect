# TWF Language Specification

Canonical, normative source for the Temporal Workflow Format (TWF) language.

This module is the **root of the dependency graph** for the rest of the
project: parser, visualizer, and skills all encode the rules defined here.

## Layout

```
tools/spec/
  spec.go          # //go:embed sections/*.md + public API
  spec_test.go     # invariants enforced at `go test` time
  sections/
    NN-slug.md     # one section per file, ordered by NN prefix
```

Each file in `sections/` is one logical chunk of the spec. The numeric
prefix gives canonical render order (`Sections()` and `All()` return them
in that order). The slug (filename minus prefix and extension) is the
public API key — `spec.Get("workflows")`, `twf spec workflows`.

## Authoring rules

These rules are enforced by `spec_test.go`. CI fails if any are violated.

1. **Filename:** `^\d{2}-[a-z0-9-]+\.md$` (e.g. `04-nexus.md`).
2. **Exactly one H1.** The first non-blank line of the file is `# Title`,
   and no other `# ` heading appears in the file. The H1 becomes
   `Section.Title`.
3. **No duplicate slugs.** Slugs are unique across `sections/`.
4. **Stable ordering.** Sections render in numeric-prefix order; insert
   a new section by picking an unused two-digit prefix.

## Adding a new section

1. Create `sections/NN-your-slug.md` with a single H1 line at top.
2. Run `go test ./...` from `tools/spec/` to verify invariants.
3. Update cross-references in skills and review commands if other
   sections need to link to it.

## Consumers

- **Embedded API** (`github.com/jmbarzee/temporal-architect/tools/spec`):
  `Sections()`, `Get(slug)`, `All()`. Imported by `tools/lsp/cmd/twf` to
  back the `twf spec` subcommand.
- **`twf spec` CLI:** prints the full spec, lists section slugs, or
  prints a single section. See [tools/lsp/cmd/twf/README.md](../lsp/cmd/twf/README.md).
- **Skill prompts:** link directly to specific section files
  (e.g. `tools/spec/sections/04-nexus.md`) so prompts stay focused.
- **Review commands:** `.claude/skills/dev-cycle/references/review-quality-dsl-spec.md`
  reviews the spec; `.claude/skills/dev-cycle/references/review-alignment-parser.md`
  aligns the parser to it.

## Embedding mechanics

`spec.go` declares `//go:embed sections/*.md`. The embed pattern only
matches files inside this package's directory tree, which is why the
spec lives in its own module rather than under `tools/lsp/`. The
embedding file is the single Go source — there is no per-section
`//go:embed` line to maintain.
