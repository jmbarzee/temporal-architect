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
| `taxonomy.ts` | `createTaxonomy`. It declares a style axis (`entity`, which is also the allow-list filter), node styles by label, glyph, colour and size (the physics and the rest bands are the library's defaults), edge types (containment classified by its declared pairs, the three requirement kinds by `match` on the `requirement` axis over one course–course pair, and a `classifyEdge` for the one exception the declarations cannot express, a lab's dependency), two filter axes with opposite `emptyMeans` (one with `chipsFor` and an `initialSelection` naming whole chips), payload scalars that answer raw numbers for the frame to normalise (`normalize: 'range'` for the level), `contextLine` and `highlight`. |
| `graph.ts` | `Graph`. It writes `parentId` and no containment edge (the library derives it), sets its own `requirement` axis on every dependency edge (no relation: a dependency is the default), gives a cross-listed course's nodes one `copyKey`, and rings a listing no department owns. |
| `App.tsx` | `GraphView` state props by need: `filter` controlled (the details panel narrows it), `selectedId`/`onSelectionChange` controlled (closing the panel clears the selection), the axes, the locks (none: one view has nothing to lock against, so no toggles) and `search` left to the view, `theme` controlled with `onThemeResolved` handing the shell the theme the pane drew in. Also `TaxonomyContext`, `defaultFilter`, `counts`, `findings`, `groups` with `groupsControl` rendering a `GroupLegend` (its toggles are the host's `enabled`; hover emphasis is `groupsControl`'s `emphasize`, so the host rebuilds nothing on hover), `nodeAction` and `onNodeActivate` (details), `focus` (Reveal: a keyed request the view honours once its node is in the graph — widen the filter, centre, select), `withSelection`/`selectionFor`, `nodesById`/`copyGroups` and `payloadString`/`payloadNumber` for the details panel's listings, and `schemeVars` for the side panel's colours. |
| `main.tsx` | `themeChoiceOf`. |
| `app.css` | The library's tokens (`--gv-color-*`, `--gv-font-*`) and the scheme's `--gv-node-<value>`. |
