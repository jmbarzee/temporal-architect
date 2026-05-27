# Visualizer: Surface Structured Diagnostics from `twf parse`

`twf parse` emits structured validator/resolver diagnostics — severity, kind, code, file,
position, message — as a `diagnostics: Diagnostic[]` array in the JSON envelope on stdout.
The visualizer's type system models this shape (`tools/visualizer/src/types/ast.ts`), but
no consumer reads it. As a result, validator output — including the orphaned-worker warning
the user originally reported missing — never reaches the UI.

## Problem Statement

Today's diagnostic flow has two breaks:

### Break 1: VS Code extension drops the structured diagnostics

`packages/vscode/src/extension.ts` (`_parseFilesWithMetadata`, around lines 511–576) parses
`twf parse`'s stdout JSON but only extracts `definitions`. The structured `diagnostics`
field is read past and discarded. The extension separately watches `stderr` and wraps any
non-empty stderr as a single `FileError { file, error: "Parser warning", stderr: "<raw>" }` —
but on the current `twf` build, diagnostics moved into the JSON envelope and stderr is
empty for a successful parse. The webview receives `{ definitions, errors: undefined,
focusedFile }` and never sees a single warning.

### Break 2: Visualizer has no consumer of `ast.diagnostics`

`tools/visualizer/src/types/ast.ts` defines:

```ts
export type DiagnosticSeverity = 'error' | 'warning'
export type DiagnosticKind = 'parse' | 'resolve' | 'validate'

export interface Diagnostic {
  severity: DiagnosticSeverity
  kind: DiagnosticKind
  code: string
  file?: string
  start: Position
  end: Position
  message: string
  name?: string
}

export interface TWFFile {
  // ...
  errors?: FileError[]
  diagnostics?: Diagnostic[]
}
```

Grep confirms `diagnostics` is only re-exported from `lib.ts` for downstream consumers. The
visualizer itself never reads it. Both `TreeView`'s `ErrorsHeader` and `GraphView`'s
`GraphErrorsHeader` render `ast.errors: FileError[]` only.

### Side effect: existing header is misleading even when populated

`FileError` is a flat shape (`{ file, error, stderr? }`) with no severity. The existing
headers count entries as "errors" regardless of whether the underlying validator output was
a warning. A `validate/UNCOVERED_ACTIVITY` warning that historically rode through stderr
showed up labelled as an error.

## Data Flow Target

```
twf parse <file>  ──┐    stdout JSON envelope:
                    │      { definitions, diagnostics, summary { warnings, errors } }
                    │    stderr: empty
                    │
                    ▼
packages/vscode/src/extension.ts
  - reads stdout, extracts definitions AND diagnostics                      [NEW]
  - drops the "stderr → FileError" path (obsolete on current twf)           [REMOVE]
  - emits per-file diagnostics with file path stamped on each entry         [NEW]
                    │
                    ▼
webview message → App.tsx → WorkflowCanvas → { TreeView | GraphView }
                    │
                    ▼
TreeView.ErrorsHeader / GraphView.GraphErrorsHeader
  - render structured diagnostics (severity + code + location + message)   [NEW]
  - partition into severity counts: "N errors, M warnings"                  [NEW]
  - keep the shown-files / hidden-files split for filter awareness          [KEEP]
  - FileError path remains for actual parser-process failures               [KEEP]
```

## Scope

### Group 1: VS Code extension forwards `diagnostics`

**File:** `packages/vscode/src/extension.ts`

In `_parseFilesWithMetadata`:

- Type stdout as `{ definitions?: Definition[]; diagnostics?: Diagnostic[] }`.
- For each successful parse, stamp `file` onto every diagnostic that lacks one (`twf`
  already emits relative paths, but the extension should ensure absolute or
  workspace-relative paths so the file-filter accounting works), and append into an
  `allDiagnostics: Diagnostic[]` accumulator.
- Drop the "stderr → FileError" branch entirely. Stderr from `twf parse` is no longer used
  for diagnostics. (Keep the `catch` branch — actual `execFileAsync` failures or JSON parse
  failures still need to surface as `FileError`.)
- Return shape gains `diagnostics`:

  ```ts
  return {
    definitions: allDefinitions,
    errors: allErrors.length > 0 ? allErrors : undefined,         // parse-process failures only
    diagnostics: allDiagnostics.length > 0 ? allDiagnostics : undefined,  // NEW
    focusedFile: this._focusedFile,
  };
  ```

### Group 2: Standalone-mode pass-through

**Files:** `tools/visualizer/src/App.tsx`, `tools/visualizer/src/webview.tsx`

`ast.diagnostics` already flows through `App.tsx` and `webview.tsx` because they just
`setAst(message.data)` / `setAst(json)` without filtering. Confirm with a quick read; no
change expected. Document in this REVISIONS that the JSON-envelope path is the source of
truth for standalone mode.

### Group 3: Render diagnostics in the existing error headers

**Files:**
- `tools/visualizer/src/components/TreeView.tsx` (`ErrorsHeader`, `ErrorGroup`)
- `tools/visualizer/src/components/GraphView.tsx` (`GraphErrorsHeader`)
- `tools/visualizer/src/components/WorkflowCanvas.tsx` (thread `ast.diagnostics` to both
  views alongside the existing `ast.errors`)
- `tools/visualizer/src/styles/index.css` (warning-variant styling)

Extend (not replace) the existing headers. Today they render `FileError[]`; after this they
render `FileError[]` (process failures) AND `Diagnostic[]` (validator output). Concretely:

- **Counts.** Header summary becomes `"N errors, M warnings"`, where N = total `FileError`
  entries + diagnostics with `severity: 'error'`, and M = diagnostics with
  `severity: 'warning'`. If both groups are zero the header doesn't render. If only
  warnings exist, render `"M warnings"` (drop the errors fragment cleanly).
- **Filter-aware split.** Keep the existing "shown files" / "hidden files" partition.
  Diagnostics whose `file` is in `filter.selectedFiles` go in the shown group; the rest go
  in the hidden group. When `selectedFiles.size === 0` (no file filter), everything is
  shown.
- **Per-entry rendering.** A diagnostic renders as:

  ```
  [severity-glyph] [code]  message
                          <file>:<line>:<column>
  ```

  Use the warning palette (`--warning-fg` / `--warning-bg`) for `severity: 'warning'`
  rows and the existing error palette for `severity: 'error'`. The `header-search-badge`
  yellow already in `index.css` is a reasonable starting hue for warnings; promote to a
  pair of `--warning-*` CSS variables.
- **Severity glyphs.** `⚠` for warning, `✗` (or the existing error icon) for error.
- **Grouping order.** Errors first, then warnings, within each of shown/hidden.

### Group 4: Summary roll-up (small)

**File:** `tools/visualizer/src/components/WorkflowCanvas.tsx`

The JSON envelope's `summary` already carries `errors?: number` and `warnings?: number`
counts. They're useful as a one-glance signal independent of the expanded header. Render
a small inline pill next to the active-view toolbar (Tree tab / Graph toolbar) showing
`"N⚠"` and/or `"N✗"` when nonzero. Clicking either pill expands the header. Optional —
defer if it complicates the toolbar layout.

## Files Touched

| File | Change |
|---|---|
| `packages/vscode/src/extension.ts` | Extract `diagnostics` from `twf parse` stdout; drop stderr→FileError branch; emit `diagnostics` field |
| `tools/visualizer/src/components/WorkflowCanvas.tsx` | Thread `ast.diagnostics` to both views; optional summary-pill rendering |
| `tools/visualizer/src/components/TreeView.tsx` | Extend `ErrorsHeader` / `ErrorGroup` to render diagnostics with severity; relabel "N errors" → "N errors, M warnings" |
| `tools/visualizer/src/components/GraphView.tsx` | Same for `GraphErrorsHeader` |
| `tools/visualizer/src/styles/index.css` | Warning palette variables; severity-glyph styles; tighten the existing error-row layout to fit code + location |
| `tools/visualizer/spec/VIEW_FRAMEWORK.md` (§ Error Handling) | Document the new diagnostic shape, severity rendering, shown/hidden partition rule, and the kept-but-narrow role of `FileError` |
| (optional) `tools/visualizer/src/App.tsx`, `tools/visualizer/src/webview.tsx` | Confirm `ast.diagnostics` flows through; add a one-line code comment if useful |

## Open Questions

1. **Diagnostic file paths and the file filter.** `twf parse` emits whatever path it
   received on the command line. The extension passes absolute paths today. The file
   filter compares against `def.sourceFile`, also absolute. Need to confirm diagnostics'
   `file` strings line up so the shown/hidden split works without normalization.

2. **`FileError` deprecation timing.** Once diagnostics fully cover validator output, the
   only remaining `FileError` source is parse-process failure (missing `twf` binary, IO
   error, malformed JSON). Could that be modelled as a synthetic `Diagnostic` with
   `kind: 'parse'`, `severity: 'error'`, eliminating the parallel shape? Lean yes but
   scope it as a follow-up, not part of this revision, to keep the change small.

3. **Hidden-match badges on filter chips.** Today the file chips and type chips carry a
   `hiddenMatchByFile` / `hiddenMatchByType` badge when search matches are hidden by the
   filter. Should similar badges show on file chips when *diagnostics* are hidden by
   the file filter? Useful signal, but distinct visual; defer unless it falls out
   naturally from the partition we're already computing.

4. **What if `twf` binary is older?** Older `twf parse` binaries write some diagnostics
   to stderr and don't include `diagnostics` in the JSON envelope. The webview will
   silently lose warnings against an old binary. Two options:
   - Detect via `twf --version` (currently unsupported — see [terminals/1.txt](../../../) /
     ad-hoc check earlier) and warn the user that diagnostics are unavailable.
   - Keep the stderr→FileError branch as a fallback when `diagnostics` is absent from
     the envelope.

   Lean fallback. Document the version dependency.

## Dependencies

- **Independent of `parser/REVISIONS_003` (the `twf graph` consumption).** That work
  changes how the graph view sources its node/edge data, but diagnostics ride on the
  separate `twf parse` envelope and are unaffected. Either revision can land first.
- **No DSL or parser changes required** — the diagnostic shape is already final in
  `tools/lsp/cmd/twf/twf.schema.json` and emitted by the current `twf` build.

## Outcome

- Validator warnings (orphan workers, uncovered activities, task-queue coherence
  issues, etc.) render in the visualizer's error header, labeled by severity.
- "N errors, M warnings" replaces the misleading "N errors" header text.
- The header preserves its filter-aware shown/hidden partition: diagnostics in
  filtered-out files surface in the "hidden files" group with the same affordance the
  feature has today.
- `FileError` narrows to its actual remaining role — surfacing the small set of
  parser-process failures (missing binary, IO error, malformed JSON) that aren't
  validator diagnostics.
- A future cleanup can collapse `FileError` into a synthetic `Diagnostic` with
  `kind: 'parse'`, but that's deliberately out of scope here.
