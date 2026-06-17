# Parser Changes: `twf` CLI migrated to cobra + self-documenting command reference

**Source review(s):** [`internal/changes/temp-change-set/go-cmd-lib/SURVEY.md`](../temp-change-set/go-cmd-lib/SURVEY.md) — Go CLI library survey, committed recommendation (**cobra**) and migration sketch.
**REVISIONS file(s):** none (promoted directly from the survey).

## Summary

The `twf` CLI (`tools/lsp/cmd/twf`) moves off the hand-rolled standard-library
`flag` package onto **`spf13/cobra`**. This collapses the per-command
`flag.NewFlagSet` boilerplate, replaces the hand-maintained top-level `usage`
const + per-command usage strings with cobra's generated `--help`/`help`, and
makes the binary the single source of truth for the command/flag surface.

On top of the migration, a **generated, CI-gated command reference**
([`tools/lsp/cmd/twf/COMMANDS.md`](../../../tools/lsp/cmd/twf/README.md)) is
emitted from the command tree (`make gen-docs`) and gated by `make check-docs`
(`git diff --exit-code`), so any flag/command change that isn't regenerated
fails the build. Skills that previously restated `twf` flags now point at
`twf help` / `twf <command> --help`, killing the doc-drift the survey called out
(the stale `deps` reference and the missing `graph chunks` flags).

**The JSON wire contract is frozen.** cobra touches only arg-parsing, help, and
dispatch; every `print*`/`emit*`/`parseFiles`/`summarize`/`extractSymbols`
function and the envelope marshalling are byte-for-byte unchanged, and
[`twf.schema.json`](../../../tools/lsp/cmd/twf/twf.schema.json) is untouched.

## Changes by Type

### API

- **CLI flag style (the one behavioral break):** under `pflag`, long flags now
  **require** the double dash — `twf graph --json`. The stdlib `flag` package
  also accepted the single-dash form `twf graph -json`; that no longer works
  (`-json` is parsed as the shorthand cluster `-j -s -o -n`). The shipped docs
  already used `--json` throughout, so impact is low, but it is a real break for
  any script or skill using a single-dash long flag. No short flags were
  introduced (`--json` has no `-j`); the surface stays long-only for this pass.
- **`graph chunks` dispatch:** now a first-class cobra child command rather than
  a manual `args[0] == "chunks"` check in `graphCommand`. `twf graph chunks --help`
  works for free; `--json`/`--history` are persistent flags on `graph` inherited
  by `chunks`, with `--ceiling`/`--floor`/`--by` local to `chunks`.
- **`version`:** `twf version` is preserved as a subcommand and `twf --version`
  (with cobra's auto `-v` shorthand) reproduces the legacy `twf <version>`
  output; the legacy `version`/`--version`/`-v` and `help`/`--help`/`-h` switch
  arms in `main.go` are dropped in favor of cobra's built-ins.
- **`twf completion [bash|zsh|fish|powershell]`** is now available (cobra
  built-in), but kept hidden from help and the generated reference to avoid
  drowning the real commands in shell-completion boilerplate.
- Each command is its own package exposing `New() *cobra.Command` (e.g.
  `check.New()`, `graph.New()`); the legacy `XxxCommand(args []string) int`
  seams are gone — tests drive `New()` + `cmdutil.Exec` instead.

### Internal

The command layer is now split into per-command subpackages under
`tools/lsp/cmd/twf/`, so each command is a self-contained unit and naming is
consistent (`<command>.New()`). The layout:

```
cmd/twf/
  main.go / root.go / gendocs.go   package main: version + tree assembly + gen-docs
  internal/
    cmdutil/    ExitError, CodeToErr, Exec, Silence, Name — cobra/exit-code glue
    envelope/   the wire contract: Diagnostic/Position/Envelope, ParseFiles,
                Summarize/EnsureSlice/HasErrors/FormatDiagnostic, the From*Error
                lifters, and the shared graph/history helpers (LoadHistories,
                GraphDiagnostics, HistoryDiagnostics)
    command/    check/ parse/ symbols/ graph/ chunks/ spec/ lsp/ — each New()
    clitest/    test-only helpers (CaptureStdout, Testdata)
```

- **`internal/envelope`** (new): owns the frozen wire model and the parse
  front-door. Everything is now exported (`ParseFiles`, `Summarize`,
  `FormatDiagnostic`, …) because the command packages consume it; the shapes are
  byte-for-byte the same as the former private `package main` types.
- **`internal/cmdutil`** (new): the cobra↔exit-code glue — `ExitError{Code}`,
  `CodeToErr`, `Exec` (maps `RunE` errors to a process exit code), `Silence`, and
  the `Name` const. It is a leaf dependency imported by every command package, so
  it cannot create a cycle with the root assembler. Exit semantics are preserved
  exactly (`parse` exits 0 on a partial AST; `check` exits 1 on error severity
  unless `--lenient`; `symbols`/`graph`/`chunks` text mode exit 1 only when the
  AST/graph/result is nil; bare `twf` prints help and exits 1).
- **`internal/command/<name>`** (new): one package per command, each exposing
  `New() *cobra.Command` with the run logic and rendering kept package-private.
  `graph.New()` attaches `chunks.New()` as its child; the **graph↔chunks import
  cycle is avoided** by keeping the shared history/graph-diagnostic helpers in
  `envelope` (both import `envelope`; `graph` imports `chunks` one-directionally).
  `chunks` reads the inherited `--json`/`--history` off the merged flag set rather
  than via shared pointers.
- **`package main`** is now just assembly: `main.go` (the `version` var, kept here
  so the `-X main.version` ldflag resolves), `root.go` (`newRootCmd(version)`
  wiring all command packages), and `gendocs.go`.
- **`tools/lsp/cmd/twf/gendocs.go`** (new): a hidden `gen-docs` command that
  renders the whole tree into one deterministic markdown file via `cobra/doc`,
  stripping cobra/doc's dated "Auto generated" footer (which would otherwise
  break the CI drift gate) and rewriting cross-file SEE-ALSO links into
  intra-document anchors. Wired with a `//go:generate` directive.
- **`tools/lsp/cmd/twf/COMMANDS.md`** (new, generated): the committed command
  reference. Regenerate with `make gen-docs`.
- **`tools/lsp/go.mod`:** add `github.com/spf13/cobra` (+ `github.com/spf13/pflag`
  and the `cobra/doc` deps `go-md2man`/`blackfriday`).

### Tooling / CI

- **`Makefile`:** new `gen-docs` (regenerate `COMMANDS.md`) and `check-docs`
  (regenerate + `git diff --exit-code`) targets.
- **`.github/workflows/ci.yml`:** the test job now runs `make check-docs` so a
  drifted command reference fails CI.

### Documentation

- **`tools/lsp/cmd/twf/README.md`:** the hand-maintained `## Options` flag list
  (which carried the stale `deps` reference) now points at the generated
  reference and `--help`; the command section links to `COMMANDS.md`; fixed the
  stale `/* deps --json */` comment to `/* graph --json */`. Conceptual sections
  (JSON envelope, node-ID grammar, edge kinds, diagnostic codes) stay
  hand-authored — cobra/doc does not produce them.

## Tests

- The former flat tests moved alongside the code they exercise: the parse /
  diagnostic / envelope / history tests now live in `internal/envelope`
  (`envelope_test.go`), and the command acceptance tests in
  `internal/command/graph` and `internal/command/chunks` (external `_test`
  packages that build `graph.New()` and drive it via `cmdutil.Exec`, with the
  `graph chunks` tests routed through the assembled parent). Shared stdout
  capture and testdata-path resolution moved to `internal/clitest`. Assertions
  are otherwise unchanged.
- Smoke-verified by hand: `twf version` / `--version` output, `check` exit codes
  (clean=0, error=1, `--lenient`=0), bare `twf` (help + exit 1), `graph chunks`
  text/JSON, the `--history` mutual-exclusion guard, and that `-json` now fails
  with `unknown shorthand flag` (the documented break).
- `make vet`, `make test`, and `make check-docs` green from the repo root
  (with `GOMODCACHE=$HOME/go/pkg/mod` per `AGENTS.md`).

## Downstream propagation

- **`skills` (this change, intra-cycle):** the mechanical flag restatements were
  updated to defer to `twf help` / `twf <command> --help` and the generated
  reference, and two drift instances were fixed:
  - [`skills/temporal-architect/reference/decomposition.md`](../../../skills/temporal-architect/reference/decomposition.md) — replaced the `twf graph chunks [--ceiling N] [--floor M] [--by ...]` syntax block with a `--help` pointer + conceptual flag meanings.
  - [`skills/temporal-architect/SKILL.md`](../../../skills/temporal-architect/SKILL.md) — softened the `--ceiling N` flag token to the "ceiling" concept; added a `--help` pointer.
  - [`skills/temporal-architect-design/SKILL.md`](../../../skills/temporal-architect-design/SKILL.md) — added a `twf help` pointer and corrected the stale "Error format" line to the current `<severity> [<kind>/<CODE>] at <file>:<line>:<col>: <message>` shape.
  - Conceptual `twf spec` / `twf graph --history` mentions in the other skill docs were left as-is (not flag restatements).
- **`vscode` (`packages/vscode/`):** consumes LSP responses and `twf parse`/
  `twf symbols` JSON, all unchanged — no action needed. If any extension code
  shells out to `twf` with single-dash long flags, it must switch to `--`; none
  observed.
- **`visualizer`:** reads the `graph`/`definitions`/`symbols` JSON payloads,
  which are byte-for-byte unchanged — no action needed.

## Open questions (resolved for this pass)

- **Generated-doc location:** a separate generated file (`COMMANDS.md`) the
  README links to, rather than an in-README section — the README interleaves the
  per-command reference with hand-authored conceptual content, so in-place
  generation isn't clean, and a sibling file is simpler to `git diff`.
- **Short flags:** long-only for this pass to keep the surface stable; pflag
  shorthands can be added deliberately later.
