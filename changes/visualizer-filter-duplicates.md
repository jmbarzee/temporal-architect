# Visualizer Filter / Duplicate-Items Memory

## Symptom

In the visualizer **Tree view**, definitions appeared as duplicate top-level items. The duplicates couldn't be controlled independently by filters — toggling a type off either hid both copies or neither, never just one. Clicking a "duplicate" scrolled to and expanded the "real" copy because they shared state.

## Root cause (two compounding bugs)

1. **Same physical file parsed twice.** `packages/vscode/src/extension.ts` built `_files` from two sources — `vscode.workspace.findFiles(...)` and `editor.document.uri.fsPath` — and combined them with naive `files.includes(filePath)`. When the two strings referred to the same file via different forms (symlink resolution, macOS case preservation, `/private/var` vs `/var`, trailing separators, etc.), the file ended up in `_files` twice and was parsed twice. Every definition appeared twice in the combined AST.

2. **Non-unique React key in TreeView.** `tools/visualizer/src/components/TreeView.tsx` used `defKey = ${type}:${name}` without `sourceFile`. Any duplicate definitions (from #1, *or* from a user genuinely having the same name in two files) collided in React's reconciler and in the shared `expandedDefs` set, so they couldn't be filtered/expanded independently. `navigateTo`'s `findIndex(name, type)` always landed on the first copy, producing the "click duplicate → scroll to real and expand" behavior.

## Fix

1. **`packages/vscode/src/extension.ts`** — added `dedupeFilePaths(paths)` that canonicalizes via `fs.realpathSync.native` (with `path.resolve` fallback) and lowercases on darwin/win32. Refactored `_files` so it's only ever mutated through a private `_setFiles(files)` method that runs `dedupeFilePaths` unconditionally. All three call sites (`createOrShowForFolder` panel-update branch, the constructor, and `updateFocusedFile` cross-folder branch) go through `_setFiles`. Path canonicalization is a class invariant, not a per-callsite ritual.

2. **`tools/visualizer/src/components/TreeView.tsx`** — `defKey` now includes `sourceFile`: `${type}:${name}:${sourceFile ?? ''}`. Duplicates now render as independent React nodes with independent expand/focus state. Intentionally **does not** dedupe — masking duplicates in the view would hide a real authoring bug.

## Why this layer

- **Parser** already detects duplicate definitions, but only within a single `twf parse` invocation. The extension calls the parser once *per file*, so the cross-file resolver never runs and cross-file dupes slip through silently. (Switching to a single multi-file parse invocation would surface real cross-file collisions as resolver errors — open follow-up.)
- **Visualizer (TreeView)** would be the wrong place to dedupe — it'd silently hide the bug.
- **Extension at ingestion** is the right layer: path identity is a cross-cutting concern, owned at the input boundary.

## Apply same pattern to GraphView

`tools/visualizer/src/components/GraphView.tsx` has the same shape of vulnerability:

- It builds graph nodes via `buildGraph(ast)`. Check whether duplicate definitions produce duplicate nodes, and whether node IDs collide on `(type, name)` without `sourceFile`.
- `tools/visualizer/src/graph/build.ts` line 24 has `defsByType.set(\`${def.type}:${def.name}\`, def)` — last-write-wins; cross-file dupes silently lose data.
- The `_files` extension fix already eliminates the dominant duplicate source (same-file-parsed-twice). The remaining concern in GraphView is making any *legitimate* cross-file name collisions render distinctly, mirroring the `defKey` fix in TreeView.

## Follow-ups (not yet done)

- Switch extension's `for (const file of this._files) execFileAsync(...)` to a single `execFile(parserCommand, [...baseArgs, ...this._files])` invocation so the parser's cross-file resolver actually runs and surfaces duplicate-name errors to users via the existing `ErrorsHeader`.
- Optionally tighten `_files` to `private readonly _files: string[] = []` so direct reassignment is a compile error, not a convention.
