# `@temporal-architect/graph-view`: a public-API review

Read as a stranger would: the README, `src/index.ts`, the modules it reaches, and two condensed hosts. The core idea is sound and well guarded: the host declares axes and values, and the view never learns what they mean. What follows is what still stands between a stranger and a working, controllable host.

Severity: **blocker**, a stranger ships a broken host unwarned; **major**, a stranger hits it and must work around it; **minor**, friction.

## 1. Does the README get a stranger to a working host?

For a single pane, yes. The quick start (README.md:36-76) is complete, is compiled against the declarations, and states the flex-column-with-height requirement. The README stops being enough at the second view and at the first async load.

- **[major] It misstates what FilterBar needs.** README.md:194-196 says "give it the `graph` (or the `values` per axis) and it defaults the rest". In fact `filter`, `onFilterChange`, `pins` and `onPinsChange` are all required (FilterBar.tsx:64-67). The bar also reads the taxonomy only from context: `useOntology()` throws at FilterBar.tsx:121 when there is no `OntologyContext.Provider`, and `FilterBarProps` has no `ontology` prop. A stranger who follows the README gets a throw. This is why both hosts wrap the pane in a Provider even though `GraphView` takes `ontology` (surface-visualizer.ts:305, surface-catalog.ts:244). Give `FilterBar` the same `ontology?` prop, make pins optional, and correct the sentence.
- **[major] It names the colour variable wrongly.** README.md:212-213 says each value is "published as `--gv-node-<value>`". The real name is kebab-cased by `cssSuffix` (scheme.ts:38-52): `nexusEndpoint` becomes `--gv-node-nexus-endpoint`. `colorVar` is not exported. A host legend that writes `var(--gv-node-nexusEndpoint)` draws nothing and reports nothing. Export `colorVar` and document the rule.
- **[minor] Band numbers have no frame of reference.** README.md:95-96 defaults the band to "the value's slice of a stack". That stack is world units −300…400, and x is 0…380 (taxonomy.ts:174-175); a host reads neither anywhere. The visualizer writes `y: { min: -340, max: -120 }` (surface-visualizer.ts:29), which a stranger could not. Document the frame, or express bands as fractions of the stack.
- **[minor] Some contracts go unstated, and one claim is false.** Unstated: build the ontology once (graph identity is warned about at README.md:148-150, but an ontology rebuilt per render silently re-resolves everything); `positions` is read only at simulation build (GraphView.tsx:85); where `reconcileFilter`'s `axes` come from; how a legend reads a value's colour (`ontology.styleOf(v).color[theme]`). And README.md:198-199 counts `toggleValue` among "the filter operations the bar itself uses"; the bar imports only `toggleGroup` (FilterBar.tsx:37).

## 2. The taxonomy: declared, defaulted, derived

The node half is well divided. A host declares `id`, `label` and `color`; size, charge, core radius, band and abbreviation default from those and from declaration order (taxonomy.ts:199-217). The edge half is not.

- **[major] `resolveEdgeType` is required, and it restates the table.** `EdgeType` already declares `relation`, `sourceType` and `targetType` (taxonomy.ts:154-157). But those ends only "drive the split-colour token" (taxonomy.ts:149-153); classifying an edge is left to the host's rule. So both hosts re-encode their table in code. The catalog keeps a second table, `CONTAINMENT_BY_CHILD` (surface-catalog.ts:7, 98). The visualizer keeps a `has(a, b)` ladder over pairs (surface-visualizer.ts:156-167). Instead, default the rule to "the one declared type whose (relation, sourceType, targetType) matches, in either orientation". Keep `resolveEdgeType` as an optional tie-breaker for types that share a pair (`linkSignalSend` and `linkWorkflowToWorkflow`).
- **[major] Three places describe which endpoints the rule sees, and they disagree.**
  - README.md:107-110 says values are read live, so the rule "must answer … for a graduated edge whose end moved to a visible ancestor".
  - ontology.ts:117-120 says the rule "applies only while springs key on the style axis unmapped".
  - GraphView.tsx:318-321 says strokes come from "the type the derivation resolved on the edge's ORIGINAL endpoints".

  A stranger cannot tell which pairs the function must cover. `validateGraph` checks only original pairs (validate.ts:81-95), so a graduated pair the rule gets wrong is never diagnosed. Pick one behaviour: classify once, on the original endpoints, and carry the type through graduation.
- **[major] Non-ASCII value ids are refused.** `cssSuffix` maps every run of `[^A-Za-z0-9]+` to `-` (scheme.ts:41). `createOntology` throws when a suffix comes out empty or shared (ontology.ts:219-226). So a host whose values come from data cannot build a taxonomy: `'研究室'` comes out empty, and `'café'` collides with `'cafè'` (both become `caf`). Escape or hash the suffix, or number it (`--gv-node-3`), instead of refusing.
- **[minor] Edge strokes have no defaults.** All four `EdgeStroke` fields are required (taxonomy.ts:161, scheme.ts:27-32), while a whole node style needs three. Default them, with a neutral colour.
- **[minor] `filterDimensions` is required** (ontology.ts:154). Default it to the style axis as an allow-list, which is exactly what the quick start declares.
- **[minor] `reheat?: Partial<ReheatPolicy>` exposes the simulation's internals**: `alpha`, `seedRevealed`, `refit` and `resume` (dimension.ts:76-85, 126). No stranger can choose an alpha. Offer `keepCamera?: boolean` and keep the rest internal.
- **[minor] The descriptor's naming defaults don't compose.**
  - `abbreviationFor` defaults to the raw value's first two characters (dimension.ts:183), not to `labelFor`'s. Even with `labelFor: v => CAMPUS_LABEL[v]`, the tokens read `no` and `so`. The visualizer has to repeat its `labelFor` inside `abbreviationFor` (surface-visualizer.ts:182-183).
  - There is no `tooltipFor`. Adding a tooltip means rewriting `chipsFor` and repeating the label (surface-visualizer.ts:175-181).
  - A custom `chipsFor` must also drop chips for values that aren't present (surface-catalog.ts:129).

  Default `abbreviationFor` from `labelFor`, add `tooltipFor`, drop empty chips in the library.
- **[minor] Each scalar must normalise itself.** The doc says "the frame refuses anything else, loudly" (scalar.ts:16-21). Both catalog scalars hand-roll a divide-by-max (surface-catalog.ts:146-148, 157-159), which the library already has as `normalized` (scalar.ts:145). Accept raw numbers, with `normalize?: 'max' | 'none'`.

## 3. The graph model

The shape is good: opaque `id`, string-map `dimensions`, opaque `payload` with typed readers, `copyKey` for one entity in several containers.

- **[major] `relation` is a reserved key inside a map the host owns.** `RELATION_DIMENSION = 'relation'` (dimension.ts:451) sits in `GraphEdge.dimensions` next to the host's own axes (model.ts:114-122). A host axis named `relation` collides with it. The hosts already spell it two ways: the quick start writes `[RELATION_DIMENSION]`, while surface-catalog.ts:225 and surface-visualizer.ts:273 write a bare `relation:`. Make it a field, `GraphEdge.relation?: Relation`, defaulting to `'dependency'`. `Relation` then earns its export.
- **[minor] Containment can be written two ways.** One is `parentId`. The other is containment edges "between any two nodes" (README.md:141-142), with a warning when the two disagree (`containment-parent-mismatch`, validate.ts:98-106). Nothing says what a containment edge that isn't the parent does to `ascend`. Make `parentId` the only way.
- **[minor] `Graph` is typed as mutable** (`Map`, `GraphEdge[]`; model.ts:188-191), so a host's `readonly` data won't typecheck. Nothing checks that a Map key matches its `node.id`. Use `ReadonlyMap` and `readonly GraphEdge[]`, and validate the keys.
- **[minor] A derived containment edge can vanish.** The view names each one it derives `in:<node>`. If a host edge already has that id, the derived edge is skipped without a word (model.ts:164-165).

## 4. The component contract

- **[blocker] The uncontrolled filter is seeded only once**: `useControllable(filterProp, onFilterChange, () => defaultFilter(ontology, hostGraph))` (GraphView.tsx:168; "seeded once", :106). Mount with an empty graph while data loads, the usual async pattern, and every allow-list axis seeds an empty selection, which `passesSelection` reads as "show nothing" (types.ts:176-178). The filter is never re-seeded, so the pane stays blank after the data arrives, with no diagnostic; values first seen in a later graph also start hidden. On graph change, add newly present values on axes still at their default selection, or re-seed while the user hasn't touched the filter.
- **[major] Selection is the one state a host cannot control.** Filter, pins, chain, search and theme each take a value and a callback. Selection has only `onSelectionChange` (GraphView.tsx:122-123). The only way to set it is `focusNode`, which also widens filters and moves the camera. So a host whose details panel closes (surface-catalog.ts:252-253) cannot clear the pane's selection to match. Add `selectedId?: string | null`.
- **[major] Outputs hand back objects that are not the host's.**
  - `onSelectionChange`, `onHover` and `onNodeActivate` look nodes up in the derived graph (GraphView.tsx:440, 443, 453). When `dropInvalid` clears a bad parent, it copies those nodes (validate.ts:127).
  - `crossView.onFocus` receives the simulation's own node, from `sim.getNode`, which carries `x`, `y`, `vx` and `pinned` (GraphView.tsx:899, 972).

  Identity checks in the host break in some cases and not others. Always look up `hostGraph.nodes.get(id)`.
- **[major] Keyboard handling takes keys it should leave alone.**
  - `handleKey` never checks modifier keys (GraphView.tsx:562-648). It cancels Cmd/Ctrl+F (find) and Cmd/Ctrl+= and − (browser zoom) with `preventDefault`.
  - In `global` mode it captures Tab whenever the target isn't a control (:570-583), and that includes `body`. A keyboard user can never Tab into the host page.
  - It cancels Escape even when nothing handles it (:589-590).

  Return early on `metaKey || ctrlKey || altKey`, never claim Tab from `body`, and call `preventDefault` only for keys that were handled.
- **[minor] Two inputs are read once without saying so.** `positions` is read only when the simulation is built (GraphView.tsx:85). A per-render `ontology` gets none of the identity warning `graph` gets. Warn for both.
- **[minor] Callbacks fire on mount.** `onSelectionChange(null)` and `onHover(null)` fire when the view mounts (GraphView.tsx:439-444). A host that closes a panel when the selection goes null gets a spurious close.
- **[minor] The handle is thin.** It has no `select(id | null)`. `focusNode` returns `true` even when the node stays hidden (for example, an absent value on an `absentMeans: 'hidden'` axis), so a host can't tell a reveal from a failure.
- **[minor] `edgeStrokeFor` throws** (ontology.ts:292-296), although the module header promises "Resolution never throws" (ontology.ts:10). Return the fallback stroke and warn, as `styleOf` does.
- **[minor] The first paint can use the wrong theme.** `useHostTheme` starts from `ref.current`, which is `null` on the first render, and only corrects itself in a passive effect afterwards (useTheme.ts:55-58).

## 5. FilterBar and the two-view story

`reconcileFilter` plus `passesSelection` is the right split: shared policy, host-owned projection. The surface around them is thin.

- **[major] The second view must recompute what the pane computes internally.** One comment calls the pane's hidden-match tally "a precedence a host's own filter bar can share" (GraphView.tsx:393-395), but it is inline code, not an export. `countsOn` (dimension.ts:374) is unexported, though its sibling `valuesOn` is exported. So the visualizer's tree bar has to supply its own `counts`, `hiddenMatches`, `overriddenPins` and `searchExtra` (surface-visualizer.ts:343-366). Export `countsOn` and a `hiddenMatchesOf(subjects, filter, axes, valueOn, matches)`.
- **[minor] The pin flash needs plumbing in the host.** The host must clear `overriddenPins` after the flash; the pane uses a private 600 ms timer (GraphView.tsx:301-308). Let the bar own it, as it owns `recentlyChanged`.
- **[minor] `reconcileFilter` takes five positional arguments**, two of them adjacent `FilterState`s (reconcile.ts:32-38). Swapping `dest` and `source` still compiles. Take an options object instead. Also document that `axes` should be the destination view's chain. Passing every `filterDimensions` entry brings back selections on axes the bar deliberately reset when the user removed them (FilterBar.tsx:236-255).
- **[minor] `FocusTarget.name` does nothing for a host.** `reconcileFocus` reads only `target.values` (reconcile.ts:91-115). Only `matchesFocus` reads `name` (types.ts:150), and it is not exported. Drop the field or export the matcher.
- **[minor] Two props carry one-off events awkwardly.** `refreshFlash?: boolean` is documented as "Flash the whole bar once" (FilterBar.tsx:89-90), but a boolean stays set, so flashing again means resetting it first; use a number that changes per flash. `recentlyChanged` keys are `` `${axis}:${value}` `` strings (FilterBar.tsx:70, 198), which are ambiguous when an id contains `:`.
- **[minor] Nothing says how a bar outside the pane gets its theme.** `schemeStylesheet` applies dark values under `[data-theme="dark"]` (scheme.ts:135). README.md:176-179 forbids writing the resolved theme onto an ancestor of the pane. That leaves one correct move: feed `onThemeResolved` into a `data-theme` on the bar's own wrapper. The README doesn't say so.
- **[minor] `UNDECLARED_TINTS` is module-global** (FilterBar.tsx:22). That is the process-wide de-duplication ontology.ts:298-302 rejects, because it hides a second taxonomy's mistake.

## 6. Vocabulary

- **[major] Several names mean one thing, and one name means several things.**
  - Taxonomy or ontology: `createOntology` returns an `Ontology`, but the README section is called "The taxonomy" and the error says "taxonomy is incoherent" (ontology.ts:277).
  - Axis, dimension or chain: the README says "axis". The code says `DimensionId`, `filterDimensions`, and `FilterDimension` (types.ts:46, "retained as a name for readability"). It has `styleAxis()` beside `styleDimension`, and calls the axes shown `chain`.
  - "Resolve" means three things: fill in defaults (`ResolvedNodeStyle`), classify (`resolveEdgeType`), and look up (`resolveNodeStyle`, a second name for `styleOf`).
  - "Pin" means two things: an axis locked against adoption (`PinState`), and a node fixed in place ("pinned ones stay", GraphView.tsx:62).
  - "Focus" means five things: `focusNode`, `FocusTarget`, the descriptor's `focus` policy, keyboard focus, and `crossView.onFocus`. The last is just a host action in the hover box; the catalog uses it as "Open details" (surface-catalog.ts:252).
  - "Type": `sourceType` and `targetType` hold style values, not edge types.
  - `valueOn`, `valueFor` and `valuesOn` are near-homonyms.

  Pick "taxonomy" and "axis". Rename `crossView` to `nodeAction: { label, onSelect }`, `resolveEdgeType` to `classifyEdge`, `sourceType` to `sourceValue`, `PinState` to `AxisLocks`, and `chain` to `axes`.
- **[minor] The first host's vocabulary is still in the package.** The CSS classes `gv-header-types-section` and `gv-header-file-tag` (FilterBar.tsx:95-96) are public API, per README.md:211. Doc comments still say "A file chip shows its basename" (dimension.ts:50-52), "e.g. \"Endpoint\"" (taxonomy.ts:43) and "`2 Wk · 1 Ep`" (taxonomy.ts:92). README.md:12-13 claims a ratchet holds that vocabulary at zero; it evidently doesn't scan class names or comments. Rename the classes to `gv-chip-*` and `gv-tag-*`.

## 7. Exports

- **[minor] Some exports are of no use to a stranger:**
  - `toggleValue`: the bar doesn't use it.
  - `useHostTheme`: a pane internal.
  - `Relation`: no exported signature uses it while `relation` is a string in a map.
  - `ReheatPolicy`: see §2.
  - `copyKeyOf`: a one-liner.
- **[minor] Some exports are missing:**
  - `colorVar`.
  - `countsOn` and a hidden-match helper.
  - `filterStatesEqual`, which a host controlling the filter needs to skip updates that change nothing.
  - Types that appear in exported signatures but aren't exported themselves: `AxisNamer` (the base of `ResolvedDimensionDescriptor`) and `StyleSubject` (in `Ontology.valueOn`).
- **[minor] `Ontology` is a plain exported interface** (ontology.ts:50-127). A host can build one by hand and skip every check `createOntology` makes. Brand it so only `createOntology` can produce one (issue #195 is filed).
- **[minor] The types aren't ready for React 19 yet.** The peer range is `^18 || ^19` (package.json:52), but `searchInputRef?: React.RefObject<HTMLInputElement>` (FilterBar.tsx:76) rejects what React 19's `useRef<HTMLInputElement>(null)` returns. Type it `RefObject<HTMLInputElement | null>` (#200 is filed). The README should also say the package is ESM-only.

## 8. What the hosts carried, and what they cannot switch off

The hosts did these by hand; the library should do them:

- restate the edge table as a classification rule (both hosts).
- normalise each scalar (the catalog).
- queue focus requests for a lazily mounted pane, since the handle doesn't exist before mount and there is no `selectedId` prop (surface-visualizer.ts:329-336).
- compute counts and hidden matches for the second filter bar.
- wrap a Provider around a component that already takes `ontology`.
- adapt `SearchState` to the host's own `(query, active)` handler (surface-visualizer.ts:323-324).
- repeat labels in `chipsFor` and `abbreviationFor`.

A host cannot turn these off:

- the pin toggle on every axis, even in the single-view catalog, where pins mean nothing (FilterBar.tsx:227-232).
- chain editing, unless the host controls the chain and passes no callback.
- the search control.
- the Fit / Play / fps / node-count cluster (GraphView.tsx:775-804). `controls={false}` hides only the force panel.
- the shortcuts panel.
- the in-pane list of diagnostics (GraphView.tsx:754).
- the hover box's direction line, which always says "dependencies" or "dependents" (GraphView.tsx:968).
- double-click zoom to a node's neighbours (GraphView.tsx:455-461).
- the console warnings.
- the pane's search strings, hard-coded (GraphView.tsx:746-747) though `FilterBar` takes them as props.

**[major]**, taken as a group. Add `chrome?: { search?, pins?, transport?, diagnostics?, shortcuts? }`, and pass `searchTitle` and `searchPlaceholder` through to the bar.

## 9. Defects in the code

- **[major] Double-click reports from a stale graph.** `handleDoubleClickNode` (GraphView.tsx:448-462) reads `graph` but lists only `[fit]` as a dependency. After the host's graph changes, double-clicking a node added since mount never fires `onNodeActivate`, and nodes that survived are reported from the old graph. Add `graph` to the dependencies, and better, read the host's own graph.
- The rest are cited in place: §4's blocker, output identity, keyboard capture, non-ASCII ids, `edgeStrokeFor`.

## 10. Top ten changes, ranked

1. **Re-seed the uncontrolled filter when the graph changes.** A graph that is empty at mount leaves the pane blank for good, with no message.
2. **Classify edges from the declared `(relation, sourceType, targetType)` by default, once, on the original endpoints.** Both hosts restate their table, and nothing defines which pairs the rule must handle.
3. **Add `selectedId`, always emit the host's own node objects, and fix double-click's stale graph.** Selection is the one state a host can't control, and the outputs leak copies and simulation nodes.
4. **Give `FilterBar` an `ontology` prop, make pins optional, export `countsOn` and the hidden-match helper, and fix the README's two-view section.** A second view currently means reading the source.
5. **Fix the keyboard: ignore modified keys, never capture Tab from `body`, and cancel only the keys that were handled.** Today the view breaks browser find, browser zoom and the page's Tab order.
6. **Make `relation` a field of `GraphEdge`.** As a reserved key in a host-owned map it can collide, and it is already spelt two ways.
7. **Unify the vocabulary**: "taxonomy" and "axis"; `classifyEdge`, `nodeAction`, `AxisLocks`, `sourceValue`. The overloaded "resolve", "pin" and "focus" mislead on a first read.
8. **Let a host turn off the built-in chrome, and pass the pane's strings through.** A single-view host can't remove pins, search or the Fit/Play cluster.
9. **Accept any value id, export `colorVar`, and correct the README's variable name.** Escape or number the CSS suffix. Today non-Latin ids throw, and CSS that uses the documented name fails silently.
10. **Trim and seal the surface.** Brand `Ontology`; drop `toggleValue`, `useHostTheme`, `FocusTarget.name`; replace `reheat` with `keepCamera`; let scalars return raw numbers. Fewer exports, each one a stranger would use.

**Findings:** 1 blocker, 13 major, 26 minor.
