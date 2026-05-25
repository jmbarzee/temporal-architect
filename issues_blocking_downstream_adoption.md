# Upstream Specs for Architecture-Mode TWF Integration

Coordinated upstream changes targeting
[`jmbarzee/temporal-architect`](https://github.com/jmbarzee/temporal-architect)
that unblock or improve spec-builder's architecture-mode integration. These
are written in GitHub-issue style (Context / Proposal / Acceptance criteria /
Downstream impact) so they can either be filed as issues or dropped directly
into a coding-agent prompt against the temporal-architect repo. Decisions backing
each item live in [`architecture-mode-discovery.md`](architecture-mode-discovery.md).

| # | Title | Priority | Blocks Phase | Upstream landing |
|---|---|---|---|---|
| 1 | Attach native `twf` binaries as GitHub Release assets | Medium | none (improves Phase 1 install UX) | **landed** — see `.github/workflows/release.yml` (matrix `build-twf-archive`, `SHA256SUMS`, `scripts/install.sh`) |
| 2 | Publish `@temporal-architect/visualizer` as an ESM React component on npm | Medium | none (Phase 2+ aspiration) | **landed** — see `tools/visualizer/vite.lib.config.ts` + `publish-visualizer` job; requires `NPM_TOKEN` secret in GitHub before first release |
| 3 | Publish skills bundle (`skills.tar.gz` or `temporal-architect-prompts` package) on each release | Low | none (Phase 2+ polish) | **landed (3a)** — see `scripts/gen-skills-manifest/` + `make build-skills-archive`; 3b PyPI distribution still open |
| 4 | Add structured diagnostics (uniform JSON envelope across `twf parse` / `symbols --json` / `deps --json`; `check` stays text) | **High** | Phase 2 polish (Phase 2 ships without it but is brittle) | **landed** — see `tools/lsp/cmd/twf/twf.schema.json` + `diagnostic.go`; symbolic codes mirror `resolver.ErrorKind` / `validator.ErrorKind` |
| 5 | Relocate the language spec to `tools/spec/`, split into per-topic sections, embed in `twf`, expose via `twf spec` | Low | none (Phase 2+ DX) | **landed** — see `tools/spec/` module and `twf spec` subcommand |

When an item lands upstream, replace `_not yet implemented upstream_` with
the corresponding commit / tag.

## Cross-cutting hygiene

These didn't ship as their own numbered issues but were fixed in the same
push that closed out the issues above. Recorded here for completeness.

- **`LICENSE` at the repo root.** The project declared `"license": "MIT"`
  in every `package.json` but had no actual `LICENSE` file. Now: MIT,
  `Copyright (c) 2026 Jacob Barzee` at the repo root. The visualizer's
  `package.json` uses a `prepack` hook (`cp ../../LICENSE LICENSE`) +
  `postpack` cleanup to ship the same LICENSE in the npm tarball without
  tracking a duplicate. `tools/visualizer/LICENSE` is gitignored.
- **`Makefile` `build-twf-archive` double-`v` bug.** The recipe used
  `twf-v$(VERSION)` and the CI passed `VERSION=${{ github.ref_name }}`
  (already `v0.3.2`), producing `twf-vv0.3.2-darwin-arm64.tar.gz` —
  unreachable by `scripts/install.sh`'s URL builder. No release had
  shipped twf archives yet so the bug was latent. Fixed by stripping the
  leading `v` from `$(VERSION)` before prepending it (matches the
  `build-skills-archive` shim). Now accepts both `VERSION=0.3.2` and
  `VERSION=v0.3.2`.
- **`.gitignore` covers release staging.** Added `tools/visualizer/dist-lib/`,
  `tools/visualizer/LICENSE` (the prepack copy), and top-level `dist/` so
  the staging directory used by `build-twf-archive` and
  `build-skills-archive` doesn't leak into commits.
- **`release.yml` validate step.** Now asserts that both
  `packages/vscode/package.json` and `tools/visualizer/package.json`
  versions match the `v*` tag, not just the VS Code package.

---

## Issue 1

**Title.** `[twf] Attach native twf binaries as GitHub Release assets`

**Body.**

### Context

Downstream Python projects (e.g.
[temporal-sa/spec-builder](https://github.com/temporal-sa/spec-builder))
want to call `twf parse` / `twf symbols --json` as a subprocess from a
non-Go runtime, in dev environments and in CI. The two paths available today
are:

1. `go install github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf@<tag>` —
   requires Go on every dev box and CI runner.
2. Extract `bin/twf` from a platform-specific VSIX — fragile (different
   archive per platform, internal path not part of any contract).

Both work, but neither is friendly to non-Go consumers.

### Proposal

Each `v*` GitHub Release should additionally attach prebuilt `twf` binaries:

```
twf-vX.Y.Z-darwin-arm64.tar.gz
twf-vX.Y.Z-darwin-amd64.tar.gz
twf-vX.Y.Z-linux-amd64.tar.gz
twf-vX.Y.Z-linux-arm64.tar.gz
twf-vX.Y.Z-windows-amd64.zip
```

Each archive contains a single `twf` (or `twf.exe`) executable.

Optionally, a top-level install helper:

```bash
curl -sSL https://github.com/jmbarzee/temporal-architect/releases/download/vX.Y.Z/install.sh | bash
```

that detects platform, downloads the right archive, verifies a SHA-256 sum,
and drops the binary into a chosen path.

### Why this is a small change

The `release.yml` workflow already cross-builds `twf` for all five platforms
on every release (it's how the bundled-in-VSIX binary gets produced). The
delta is to upload the produced binaries as Release assets, not just embed
them into the VSIXes. The `softprops/action-gh-release` step is already
present and only needs an additional `files:` glob.

### Compatibility

No change to the VSIX artifacts. No change to the binary itself. Pure
additive.

### Acceptance criteria

- [x] Each `v*` release has 5 `twf-*` archives attached.
- [x] An `install.sh` (or equivalent docs section) shows the canonical
  one-liner.
- [x] Archive layout is documented in `tools/lsp/cmd/twf/README.md`.
- [x] SHA-256 checksums are published alongside (Release notes or a
  `SHA256SUMS` asset).

### Status

**Landed.** The release workflow (`.github/workflows/release.yml`)
cross-builds `twf` per platform via the `Package twf archive` matrix step,
uploads them as artifacts, regenerates a `SHA256SUMS` file in the publish
job, and attaches `dist/twf-*`, `dist/SHA256SUMS`, and `scripts/install.sh`
via `softprops/action-gh-release`. The install one-liner is documented in
`tools/lsp/cmd/twf/README.md`.

### Downstream impact

Spec-builder switches from `go install …@<tag>` to `curl -L`/checksum-pinned
download in its `make setup` step. CI drops the `go` setup step.

---

## Issue 2

**Title.** `[visualizer] Publish @temporal-architect/visualizer as an ESM React component on npm`

**Body.**

### Context

Downstream React apps (e.g. spec-builder's local GUI) want to embed the TWF
visualizer as a real React component:

```tsx
import { Visualizer } from '@temporal-architect/visualizer';

<Visualizer ast={parseOutput} onOpenFile={…} />
```

Today the visualizer is published only as part of the VSIX (the
`build:webview` IIFE bundle at `packages/vscode/dist/webview/visualizer.{js,css}`,
which calls `acquireVsCodeApi()` and assumes a VS Code webview runtime).
Downstream apps can vendor that bundle and embed it inside an iframe with a
shim, but that gives up React colocation, type safety on `ast`, and shared
styling.

### Proposal

Publish a new npm package `@temporal-architect/visualizer` whose default export
is a React component:

```ts
export interface VisualizerProps {
  ast: TWFFile;                              // upstream's existing type
  onOpenFile?: (file: string) => void;       // optional click handler
  onRefocus?: () => void;                    // optional focus delegate
  className?: string;
  style?: React.CSSProperties;
}

export const Visualizer: React.FC<VisualizerProps>;
export type { TWFFile, ... };                // re-export AST types
```

Implementation can be the existing
`tools/visualizer/src/components/WorkflowCanvas.tsx` lifted into the package
entry point. The VS Code extension keeps importing the same component
internally; only `webview.tsx` (the postMessage adapter) becomes
extension-specific.

### Packaging

- `package.json`: drop `private: true`, add `name: "@temporal-architect/visualizer"`,
  `publishConfig.access: "public"`, `main`, `module`, `types`, peer-dep on
  `react@^18`.
- Build outputs ESM via Vite library mode with externalized `react` /
  `react-dom`.
- `prepublishOnly` step runs the library build.
- Add a `publish-visualizer` job to `release.yml` that runs `npm publish` on
  tag.

### Versioning

Sync the npm package's version with the existing `vX.Y.Z` Git tag (use
`scripts/version.sh` to bump both).

### Compatibility

The internal `webview.tsx` adapter remains unchanged; it imports the same
component from the new package path. The IIFE webview bundle still ships in
the VSIX and downstream is encouraged to switch to the npm component path on
their own timeline.

### Acceptance criteria

- [x] `npm install @temporal-architect/visualizer` works after a release.
- [x] `<Visualizer ast={...} />` renders correctly in a host Vite React app with `react@18` (verified by an end-to-end consumer-install test: `npm pack` → install into a scratch project → `tsc --strict` against the public API).
- [x] CSS is shipped as a sibling import (`@temporal-architect/visualizer/styles.css`).
- [x] AST types are exported and consumed via DTS (bundled `.d.ts` rolled up from `src/lib.ts`).

### Status

**Landed.** Files added/changed:

- `tools/visualizer/src/lib.ts` — public entry; exports `Visualizer` (= `WorkflowCanvas`) and the full AST + diagnostic type graph.
- `tools/visualizer/vite.lib.config.ts` — library build with externalized `react`/`react-dom`, sibling `styles.css`, and `vite-plugin-dts` for declarations.
- `tools/visualizer/package.json` — `name: "@temporal-architect/visualizer"`, ESM `exports`, `peerDependencies: { react, react-dom: "^18 || ^19" }`, `publishConfig.access: public`, `prepublishOnly` runs `build:lib`.
- `tools/visualizer/src/components/WorkflowCanvas.tsx` — added `onRefocus`, `className`, `style` props per the issue spec.
- `tools/visualizer/src/webview.tsx` — uses `onRefocus` instead of an outer wrapper div (no behavior change).
- `tools/visualizer/README.md` — npm consumer docs.
- `.github/workflows/release.yml` — new `publish-visualizer` job; validate step now asserts the visualizer package.json version also matches the tag.
- `Makefile` — `build-visualizer-lib` target; `release` target now bumps both `packages/vscode/package.json` and `tools/visualizer/package.json` in lockstep.

**External action required before first publish:** add `NPM_TOKEN` to the repository's GitHub Actions secrets (Settings → Secrets and variables → Actions). Without it, the new job will fail and the rest of the release will continue.

### Downstream impact

Spec-builder swaps its iframe-based vendoring for a direct React component
import in Phase 2 (no functional change to the user — just better DX and
less drift).

---

## Issue 3

**Title.** `[skills] Publish skills bundle (skills.tar.gz or @temporal-architect/prompts) on each release`

**Body.**

### Context

The `skills/` markdown is the canonical source for AI-assisted TWF authoring.
Two audiences consume it today:

1. The Cursor / VS Code human author. The extension auto-syncs into
   `~/.cursor/skills/temporal-{design,author-go}/` on activation. This works
   well.
2. **Programmatic consumers** that bundle the markdown into LLM prompts at
   runtime (e.g. spec-builder's Gemini-driven `.twf` emission stage). These
   today have to either:
   - vendor selected files into their own repo (drifts as upstream evolves), or
   - fetch raw GitHub URLs at a pinned ref (works but is one HTTP call per
     fragment).

### Proposal

Two complementary deliverables, either or both:

**3a. `skills.tar.gz` Release asset.** On each release, attach a tarball of
`skills/` with a stable layout:

```
skills/
  design/
    SKILL.md
    reference/...
    topics/...
  author-go/
    SKILL.md
    reference/...
  MANIFEST.json   # version, file list, checksums
```

A `MANIFEST.json` lets consumers detect supported skills and reject unknown
versions cleanly.

**3b. Python distribution `temporal-architect-prompts`.** A small PyPI package
whose import surface is:

```python
from temporal_architect_prompts import design, author_go
print(design.skill_md())                  # full SKILL.md content
print(design.reference("primitives"))     # reference/primitives.md
```

Built from the same source by the release pipeline. Pure-data; no
runtime deps. Versioned in lockstep with the GitHub releases.

3a alone is enough to unblock spec-builder; 3b is a "nice to have" if a
JS/Python ecosystem grows around the skills.

### Acceptance criteria

- [x] `skills.tar.gz` attached to each `v*` release.
- [x] `MANIFEST.json` lists every shipped file with SHA-256.
- [x] The tarball's directory layout matches `skills/` in the repo at that
  tag.
- [ ] (Optional) `temporal-architect-prompts` published to PyPI on each release.

### Status

**3a landed.** Generator at `scripts/gen-skills-manifest/`, packaged via
`make build-skills-archive`, attached as `skills-vX.Y.Z.tar.gz` by the
release workflow, and included in the same `SHA256SUMS` asset as the `twf`
archives. The bundle's schema and verification snippet are documented in
`skills/MANIFEST.md`. 3b (PyPI distribution) remains open.

### Downstream impact

Spec-builder drops its `scripts/sync-twf-skills.sh` raw-GitHub-URL fetcher
and switches to a single tarball download in `make setup`, with manifest
checksum verification.

---

## Issue 4 — **highest priority for spec-builder**

**Title.** `[twf] Add twf check --json for structured diagnostics`

**Body.**

### Context

Downstream consumers want to drive a "draft → validate → fix → revalidate"
loop programmatically. The diagnostic shape we get today from `twf parse`
(stderr text) and `twf check` (no `--json` flag) is:

```
parse error at 3:1: expected COLON, got EOF ("")
resolve error at 2:5: undefined activity: ValidateOrder
```

This is regex-parseable — and that's how spec-builder is doing it today —
but the format is undocumented, drifts with parser changes, doesn't carry
end-positions or codes, and loses information present in the Go-side
diagnostics (e.g. `parser.Error{Pos, EndPos, Code, Note}`).

### Proposal

Add a `--json` flag to `twf check`:

```bash
twf check --json [--lenient] <file...>
```

emitting a single JSON document on stdout (no stderr noise on the JSON
contract) of the form:

```json
{
  "summary": {
    "files":      [{"path": "spec.twf", "workflows": 6, "activities": 24}],
    "totals":     {"workflows": 6, "activities": 24}
  },
  "diagnostics": [
    {
      "severity":  "error",
      "kind":      "parse",
      "code":      "PARSE001",
      "file":      "spec.twf",
      "start":     {"line": 3, "column": 1},
      "end":       {"line": 3, "column": 1},
      "message":   "expected COLON, got EOF",
      "hint":      null
    },
    {
      "severity":  "error",
      "kind":      "resolve",
      "code":      "RESOLVE002",
      "file":      "spec.twf",
      "start":     {"line": 2, "column": 5},
      "end":       {"line": 2, "column": 17},
      "message":   "undefined activity: ValidateOrder",
      "hint":      "did you mean 'ValidateOrders'?"
    }
  ]
}
```

Exit codes are unchanged (0 = clean, non-zero = errors; `--lenient` demotes
resolve to non-fatal as today).

### Bonus (optional)

- A JSON Schema published at `tools/lsp/cmd/twf/check.schema.json` so
  consumers can validate the output and TypeScript/Python types can be
  generated.
- A matching `--json` on `twf parse` (today's behavior is unconditional JSON,
  but the **separation** of `definitions` from `diagnostics` is the actual
  ask — we want diagnostics inside the parse output too, not on stderr).

### Why this matters

This is the smallest upstream change that meaningfully unblocks programmatic
consumers. Today spec-builder's `run_twf_validate` activity has a regex over
upstream's stderr, which is brittle because (a) error messages can include
colons, parens, etc., that confound a single-line regex, and (b) the format
is not part of any documented contract.

### Status

**Landed**, with a design refinement away from `twf check --json`.

Instead of stapling `--json` onto `check`, structured diagnostics live in
the **canonical JSON envelope** emitted by `twf parse`, and the same
envelope shape is shared by `twf symbols --json` and `twf deps --json`:

```json
{
  "summary":     { "workflows": …, "errors": …, "warnings": … },
  "diagnostics": [ { "severity", "kind", "code", "file", "start", "end", "message", "name" } ],
  "definitions" | "symbols" | "graph": …
}
```

`twf check` stays text-only — it now prints `severity [kind/code] at file:L:C: message` and uses the same structured diagnostic pipeline internally. Downstream consumers that want structured output call `twf parse` (or `<cmd> --json`).

### Acceptance criteria

- [x] `twf parse` emits the documented schema with no stderr noise on the happy path.
- [x] `twf check --lenient` reports diagnostics but exits 0.
- [x] Regression tests in `tools/lsp/cmd/twf/diagnostic_test.go` cover representative parse and resolve diagnostic kinds, the envelope shape, the empty-diagnostics-as-`[]` contract, and the text format.
- [x] JSON Schema checked in at `tools/lsp/cmd/twf/twf.schema.json`.

### Design notes

- **Symbolic codes** (e.g. `UNDEFINED_ACTIVITY`, `MISSING_TASK_QUEUE`) over numeric ones — self-documenting, greppable, and friendly to LLM consumers reasoning over them.
- **`end == start`** for resolve/validate diagnostics today; the schema commits to `end` being present so precision can improve later without breaking consumers.
- **LSP server** also forwards the symbolic `Code` field through to editor clients, so VS Code/Cursor hover routing and rule-doc deep links work without a second contract.

### Downstream impact

Spec-builder drops the regex-over-stderr fallback in
`spec_builder_activities.run_twf_validate` and switches to
`json.loads(stdout)` against `twf parse`'s `diagnostics` field. No behavior
change for users; this is a purely internal robustness upgrade. The
symbolic `code` field lets the validate-loop dispatch on the diagnostic
type without parsing messages.

---

## Issue 5

**Title.** `[twf] Relocate language spec to tools/spec/, split into per-topic sections, embed in twf binary`

**Body.**

### Context

The TWF language specification was previously a single file at
`tools/lsp/LANGUAGE_SPEC.md` — visually filed under the parser, but
actually the *root* of the project's dependency graph (parser, visualizer,
and skills all encode the rules it defines).

Programmatic consumers (LLM prompt builders, doc sites, non-Go tooling)
retrieved it the same way they retrieved the skills bundle — by vendoring
or fetching raw GitHub URLs at a pinned ref. That worked but it (a)
drifted from the parser version actually installed on the box, (b)
required network access, and (c) gave no way to ask for "just the nexus
section" without regex over a 967-line monolith.

### Proposal

Three coordinated changes:

**1. Relocate the spec to its own module.** New module
`github.com/jmbarzee/temporal-architect/tools/spec`, sibling to
`tools/lsp/`. Wired through a repo-root `go.work` and a relative
`replace ../spec` in `tools/lsp/go.mod`.

**2. Split into per-topic section files.** One markdown file per
top-level concept under `tools/spec/sections/`, named `NN-slug.md`:

```
00-overview.md
01-workflows.md
02-activities.md
03-workers-and-namespaces.md
04-nexus.md
05-statements.md
06-statement-syntax.md
07-expressions.md
08-tokens-and-keywords.md
09-indentation.md
10-context-restrictions.md
11-resolution-and-errors.md
12-grammar-summary.md
```

The numeric prefix gives canonical render order; the slug is the public
API key. Each file has exactly one H1 (its title). Invariants are
enforced by `tools/spec/spec_test.go`.

**3. Single embedding file + `twf spec` subcommand.** `tools/spec/spec.go`
declares `//go:embed sections/*.md` once and exposes a small Go API
(`Sections()`, `Get(slug)`, `All()`). The `twf` CLI imports that package
to back a new `spec` subcommand:

```bash
twf spec               # full spec to stdout (concatenation in canonical order)
twf spec --list        # slug + title table for navigation
twf spec workflows     # print one section by slug
```

### Why this is a small change

- `embed` is stdlib (Go 1.16+); no new third-party dependencies.
- The split is mechanical (H2 boundaries align with section files).
- `tools/spec/` is a new module, not a refactor of `tools/lsp/` —
  parser code is untouched.
- The relative `replace ../spec` in `tools/lsp/go.mod` resolves both
  for local development (`go.work`) and for `go install ...@<tag>`
  (the toolchain fetches the whole repo, so relative paths work).

### Compatibility

Pure additive for downstream consumers. Cross-references in skills,
review commands, CLAUDE.md, and READMEs were updated to point at the
new tree. The old `tools/lsp/LANGUAGE_SPEC.md` was removed as part of
the same change.

### Acceptance criteria

- [x] `tools/spec/` module exists with split sections under `sections/`.
- [x] `go.work` and `tools/lsp/go.mod` `replace` wire the modules.
- [x] `twf spec` prints the full spec; `twf spec --list` enumerates
      slugs and titles; `twf spec <slug>` prints one section.
- [x] `spec_test.go` enforces filename pattern, single-H1, unique
      slugs, canonical ordering, and `All()` round-trip.
- [x] Documented in `tools/spec/README.md` and the `### twf spec`
      section of `tools/lsp/cmd/twf/README.md`.

### Downstream impact

Prompt builders and doc tooling can either:
- Embed the binary in their toolchain and call `twf spec` /
  `twf spec <slug>` — guaranteed in sync with the parser version that
  will validate the resulting `.twf`; or
- Fetch individual `tools/spec/sections/NN-slug.md` files at a pinned
  ref — useful when a single section is enough to fit a prompt budget.
