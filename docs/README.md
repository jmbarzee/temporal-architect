# docs/ — canonical doc fragments

Single source of truth for the **prose that gets published** across distribution
channels. Each fragment covers one component of the toolchain; the distribution
repo (`jmbarzee/temporal-architect-dist`) composes per-channel listings from
`[channel header] + [these fragments]` at publish time.

See [`documentation_propagation.md`](https://github.com/jmbarzee/temporal-architect-dist/blob/main/documentation_propagation.md)
in the dist repo for the component → distribution matrix and the strategy.

## Layout

```
docs/
  fragments/
    global.md       Shared product vision + the .twf sample (the pitch every channel opens with)
    parser.md       The twf CLI / language server
    mcp.md          The twf MCP server
    visualizer.md   The architecture visualizer (tree + graph)
  images/           Canonical screenshots referenced by the fragments (relative paths)
```

Skill blurbs are **not** fragments here — they come from each `skills/*/SKILL.md`
frontmatter `description:` and are composed by the dist renderer from the staged
skills tarball.

## How fragments reach the dist repo

Docs ship **inside the artifact they cover** (no separate docs asset, no runtime
command):

- `global.md`, `parser.md`, `mcp.md` cover the binary — bundled into the
  `twf-v*` release archive by `make build-twf-archive`.
- `visualizer.md` covers the visualizer — copied into the published
  `@temporal-architect/visualizer` tgz by its `prepack` (`FRAGMENT.md`).
- Skills ride in the `skills-v*` tarball (frontmatter).

Each fragment carries its short one-liner in YAML frontmatter (`description:`),
which the dist renderer uses to stamp the channels' `description` fields (with
per-target overrides defined in the dist repo).

## Format

```
---
description: "One-line summary used for registry `description` fields."
---
<markdown body — the pitch for this component>
```

Edit the fragment; never hand-edit a generated package README in the dist repo.
