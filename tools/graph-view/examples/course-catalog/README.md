# Course catalog — an example host

A university course catalog drawn with `@temporal-architect/graph-view`:
faculties contain departments, departments contain courses, courses contain
labs. Prerequisite, co-requisite and recommended links cross the hierarchy, and
only the edge's own `requirement` tells them apart. A cross-listed course
(Biochemistry is both CHEM 310 and BIOL 310) is one node per listing, glowing
together. Degree programmes are glow groups, and catalog errors are findings.

The example imports only the package's public entry.

## Run

From `tools/graph-view`:

```sh
npx vite --config examples/course-catalog/vite.config.ts        # http://localhost:5179
node_modules/.bin/tsc --noEmit -p examples/course-catalog/tsconfig.json
```

Add `?theme=dark` (or `light`) to the URL to pin the pane's theme.

## What each file exercises

| File | Library seam |
|---|---|
| `data.ts` | None. This is the domain data in its own shape. |
| `ontology.ts` | `createOntology`. It declares a style axis (`entity`, which is also the allow-list filter), node styles by label, glyph, colour and size (the physics and the rest bands are the library's defaults), edge types and `resolveEdgeType` over the `requirement` axis, two filter axes with opposite `emptyMeans` (one with `chipsFor` and an `initialSelection`), payload scalars, `contextLine` and `highlight`. |
| `graph.ts` | `Graph`. It writes `parentId` and no containment edge (the library derives it), sets `RELATION_DIMENSION` and its own `requirement` axis on every edge, gives a cross-listed course's nodes one `copyKey`, and rings a listing no department owns. |
| `App.tsx` | `GraphView` props, `OntologyContext`, `defaultFilter`, `counts`, `findings`, `groups`/`groupsControl`, `crossView`, `reconcileFilter` with `pendingFocus` (Reveal), `withSelection`/`selectionFor`/`pinnedFor`, and `useHostTheme` + `schemeVars` for the shell's own chrome. |
| `main.tsx` | `themeChoiceOf`. |
| `app.css` | The library's tokens (`--gv-color-*`, `--gv-toolbar-height`) and the scheme's `--gv-node-<value>`. |
