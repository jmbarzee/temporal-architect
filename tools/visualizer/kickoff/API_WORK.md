# graph-view API: issues and sets of work

The issues found by three readings of `@temporal-architect/graph-view`'s public
surface at `cad095e`, deduplicated and organised into six sets of work. Each
item names its evidence, who found it, and the change that closes it. The
sets are ordered so that each one leaves the library shippable: defects first,
then the vocabulary, then the two breaking redesigns together, then the model
questions, then the trim and the docs.

Per AGENTS.md the backlog lives in GitHub issues. This file is the organising
draft; when a set is scheduled, its items are filed (one issue per item, one
epic per set) and this file points at them.

**Sources.** A: the review in this session, from the source (section 2 of the
review page). B: the friction log of the agent that built the course-catalog
host cold against the entry. C: the independent review by an agent given the
code and the three condensed hosts and nothing else. A citation `file:line` is
the finder's; ✓ marks an item re-checked in the source by this session.

**Line numbers** refer to `tools/graph-view/src/` at `cad095e` unless the path
says otherwise.

---

## Set 1 — Defects: wrong pictures and crashes, no API change needed

Fix first. Every item here is a behaviour a host cannot work around, and none
changes the public surface. Each gets a harness probe that fails before the fix.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 1.1 ✓ | major | **Two dependency edges between the same two visible nodes collapse into one.** The visible-graph pass keys every dependency edge by `${src}→${tgt}`, visible endpoints included, and rewrites its id to `grad:…`. A workflow that both calls and signals another draws one edge; which one survives depends on whether its payload is non-empty, which the README says the library never reads. A host `highlight` that returns its own edge ids lights nothing. | `components/graph-view/visibleGraph.ts:205-219`, `:109`; `README.md:43-44` | B14, B15, C4 |
| 1.2 ✓ | major | **Edge-type errors throw inside render memos, outside the error boundary.** `relationOf`, `edgeStrokeFor` and the spring `classify` throw for an undeclared relation or id; the throws happen in `GraphView`'s `useMemo`s while `CanvasErrorBoundary` wraps only the canvas. One bad edge unmounts the host's React tree, against "resolution never throws". | `GraphView.tsx:176,223-231,515`; `graph/model.ts:112-116`; `graph/ontology.ts:248-251`; `graph/forces.ts:555-564` | C7 |
| 1.3 ✓ | major | **Filtering applies to every declared axis, not the visible chain.** `passesFilter` reads `ontology.filterDimensions`; the bar renders only `chain`. An unchained allow-list axis with an empty selection blanks the view with no chip to explain it, and focus cannot reveal a node through it. | `visibleGraph.ts:155-162`; `GraphView.tsx` chain props | C9 |
| 1.4 ✓ | blocker | **The view captures the keyboard for the whole page.** A `keydown` listener on `window` while `active`, with `preventDefault` on Tab, Space, the arrows, `+`, `-`, `f` and `/`; only inputs and textareas are skipped. Tab navigation stops in any host page; Space on a focused host button toggles the simulation. | `GraphView.tsx:412-494` | B22, C1 |
| 1.5 | major | **Graph defects are silent.** Dangling `sourceId`/`targetId` are dropped; a dangling `parentId` and a `parentId` that disagrees with the containment edges produce no error. | `visibleGraph.ts:184-222`; `graph/model.ts:35-43` | C7 |
| 1.6 | major | **The edge classifier is handed endpoint pairs that do not exist in the host's data.** Strokes are resolved over graduated edges with their re-pointed endpoints, so a host rule must answer for pairs its model never produces (the catalog had to say so in a comment). | `GraphView.tsx:223-231`; `examples/course-catalog/ontology.ts` rule comment | B, C8 |
| 1.7 ✓ | major | **Edge-type declarations are only half honoured.** Spring resolution checks that a resolved id exists, not that its `category` matches the edge's relation; `sourceType`/`targetType` are display only; springs resolve through the host's rule only while push/pull keys on the style axis, and switching the axis replaces them with an averaged spring silently. | `graph/forces.ts:549-565`; `graph/simulation.ts` pair tuning | B8 |
| 1.8 | major | **Group colours shift as the filter changes.** The palette is assigned by position among the *visible* groups, so hiding an earlier group recolours the rest; the palette has no light-theme variant. | `graph/groups.ts:17-28,63-71` | B19, C12 |
| 1.9 | minor | **`--toolbar-height` excludes the search-results dropdown**, so a host control anchored under the bar covers the results unless it sits below z-index 10; the stacking contract is undocumented. | `GraphView.tsx` toolbar measure; `GraphView.css` | B23 |

**Closes with:** probes in `src/verify/` for 1.1 (two typed edges between visible nodes stay two), 1.3 (an unchained axis does not filter), 1.5 (`validateGraph` names each defect), 1.7 (a resolved id whose category contradicts the relation is refused at construction); a browser check for 1.4 (Tab moves focus out of the pane). 1.1's fix: merge only graduated edges, key by `(type, src, tgt)`, keep original ids, mark synthesized edges. 1.2's fix: validate once per graph and render diagnostics inside the view's own boundary. 1.8's fix: assign colours over all groups in declared order.

---

## Set 2 — Remove the first host from the library

Renames and deletions. Pre-v1, breaking is welcome (AGENTS.md); the leak ratchet
already holds the count at zero, so this set is about the names that passed it.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 2.1 ✓ | blocker | **Two library-declared axes carry the first host's names and get privileged presentation.** `defType` and `sourceFile`: `FilterBar` keys a CSS presentation table on exactly these ids (file-tag styling, per-value tint classes, the "all included" look), and the hover box prints the basename of whatever sits on `sourceFile`. A host naming its own axes silently loses both. Filtering itself never reads an id. | `graph/dimension.ts:320,351`; `components/FilterBar.tsx:111-152`; `FilterBar.css:78-88`; `GraphView.tsx:717` | A1, B1-3, C2 |
| 2.2 | blocker | **Node identity fields are the parser's vocabulary.** `definitionKey`, `orphan` ("uninstantiated definition"), `templateParams` ("parameterised family"), `Graph.duplicateGroups`; rendered as a dashed ring, `× param` badges and the hover texts "This definition appears in more than one place" and "Parameterized family". | `graph/model.ts:44-65,149`; `GraphCanvas.tsx:898`; `GraphView.tsx:772,778` | A2, B5, C2 |
| 2.3 ✓ | blocker | **VS Code is wired into theme sensing and the stylesheet.** `useTheme` sniffs `.vscode-*` body classes; `schemeStylesheet` and `tokens.css` emit a `.vscode-dark` selector; `FilterBar.css` reads `--vscode-*` custom properties. | `components/graph-view/useTheme.ts:27`; `graph/scheme.ts:133`; `styles/tokens.css:45`; `FilterBar.css:313-364` | A3, B6, C2 |
| 2.4 | major | **The two-view shell leaks into a single view's text and props.** The pin tooltip says "stop syncing with the other view"; `FilterBar.refreshFlash` is documented "on AST refresh"; the filter module's comments talk about tree rows and AST definitions. | `components/PinToggle.tsx:21`; `FilterBar.tsx:77`; `filter/types.ts:1,163-170` | B4, C2 |
| 2.5 | major | **Global, unprefixed CSS.** Tokens on `:root` named `--accent`, `--color-bg`, `--color-text`, `--font-sans`; classes `.switch`, `.header-*`, `.tooltip-*`; any `[data-theme="dark"]` in the host retunes them. Host and library overwrite each other by load order. | `styles/tokens.css:8-41`; component stylesheets | C11 |
| 2.6 | minor | **Public doc comments carry project records and sit on the wrong declarations.** About fifty references to decision and review ids and to the first host; citations of files that do not ship (GRAPH_VIEW.md, `adapter/groups.ts`, PLAN §6.6); two stacked JSDoc blocks on `styleAxis`; an orphaned block above `StyleGroup`; an import mid-file; the `isContainment` doc attached to `relationOf`. These are the IDE hovers a host sees. | `graph/ontology.ts:3,42,49-72,140-141`; `graph/model.ts:2,106-111`; `graph/dimension.ts:46`; `graph/groups.ts:8-10` | B16, C16 |
| 2.7 | minor | **Vocabulary drift.** value / style / type / key for one idea (`nodeTypeKeys`, `nodeStyles`, `NodeTypeDefinition`, `styleForKey`, `valueFor`); dimension vs axis (`styleDimension`, `styleAxis()`, `DimensionDescriptor`, `ScalarAxis`); ontology vs taxonomy (the error says "taxonomy is incoherent"); `EdgeTypeDefinition.category` holds the relation and `EdgeCategoryKind` is the relation; `FilterDimension` is an alias "retained for readability". | `graph/ontology.ts`; `graph/taxonomy.ts:89-126`; `filter/types.ts:45-46` | A7, C14 |

**Closes with:** 2.1 by moving presentation onto the descriptor (`presentation: 'tag' | 'chip'`, whether chips wear a value tint) and deleting both constants and the hover file line; 2.2 by `copyKey?` (default `id`) with the copy index derived, and generic `badges?: string[]` / `ring?: 'dashed'` in place of `templateParams` and `orphan`; 2.3 by a `hostTheme` prop or a configurable marker selector and `[data-theme]` only in the stylesheet; 2.5 by `--gv-*` tokens scoped to the pane root and `.gv-*` classes, documented as the theming API; 2.6 by a one-pass edit of the public type files with the dts gate refusing decision-id patterns; 2.7 by one term per concept. The leak gate's vocabulary list gains the words this set removes.

---

## Set 3 — Say each fact once; default what can be defaulted

The spec redesign. Breaking for both hosts; done together with Set 4 so the
hosts migrate once.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 3.1 ✓ | major | **Two required spec fields have no reader.** `NodeTypeDefinition.defaultVisible` and `OntologySpec.styleGroups` are checked at construction and read nowhere else; both hosts build their initial filter themselves; the smallest host does not and starts blank. | `graph/taxonomy.ts:35`; `graph/ontology.ts:151,200`; `grep` of `src/` | B10, C5 |
| 3.2 | major | **The style values are declared four times**, six when the style axis is also a filter: `nodeTypeKeys`, the keys of `nodeStyles`, `styleGroups`, `abbreviations`, and the descriptor's `labelFor`/`abbreviationFor` restate labels. `createOntology` exists partly to check they agree. | `graph/ontology.ts:147-156,186-201`; `graph/dimension.ts:79-86` | B9, C6 |
| 3.3 ✓ | major | **The host writes two facts twice.** `parentId` beside the containment edge; `duplicateGroups` beside `definitionKey`. The canvas recomputes duplicates from the field while the hover box reads the index, so the two can disagree. HANDOFF §4 ranked both first. | `graph/model.ts:35-43,143-150`; `GraphCanvas.tsx:252-258`; `GraphView.tsx:749` | A6, B11, C6 |
| 3.4 | major | **Filter policy has no defaults and the policies derive from one another.** All three hosts derive `absentMeans`, `focus`, `reheat.seedRevealed` and `reheat.refit` identically from `emptyMeans`; `reheat.resume` is "never false today" and still required. | `graph/dimension.ts:88-146`; the three hosts' descriptors | A4, B7, C6 |
| 3.5 | major | **Declaring a value needs simulation literacy.** `charge`, `coreRadius` and a rest `band` in world units (both hosts span about −340 to +500 and the second copied the first's magnitudes); spring `strength`/`distance`; `reheat.alpha`. No defaults; the order of `nodeTypeKeys` is already "top of the hierarchy first" and could place the bands. | `graph/taxonomy.ts:55-76,101-105`; `graph/ontology.ts:91` | A4, B7, C6 |
| 3.6 ✓ | major | **`counts` is required and an empty map renders "0" on every chip.** | `FilterBar.tsx:223,240`; `GraphView.tsx` props | C6 |
| 3.7 | minor | **Fields with obvious defaults are required**: `whenHidden`, `summaryKind`, `iconSize`, `scalars`, `chain`. | `graph/taxonomy.ts`; `GraphView.tsx:40-72` | C6 |
| 3.8 | minor | **Containment is a tree.** `parentId` is one string; an entity in two containers becomes copies sharing a key. The mechanism works and is nowhere stated as the modelling rule. | `graph/model.ts:43` | A8 |

**Closes with:** an ordered `values: [{ id, label, abbr?, icon, color, size?, physics? }]` replacing four lists; bands and physics derived from position with overrides; a one-field filter `mode: 'allow' | 'narrow'` with the four policies as optional overrides; `defaultFilter(ontology)` exported and used when the filter is uncontrolled (giving `defaultVisible` its reader); `styleGroups` read by the control panel or deleted; containment edges derived from `parentId` (or the reverse) and the copy index built inside; `counts` optional, defaulting to node counts; the README stating the copy rule for multi-container entities. `createOntology` keeps refusing what cannot be derived.

---

## Set 4 — The `GraphView` contract: props, state, outputs

The props redesign. Breaking; shipped with Set 3.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 4.1 | blocker | **Seventeen of twenty-two props are required; a one-view host wires most to no-ops.** Filter, pins, chain, search, pending focus and overridden pins are all lifted, which is right for a two-view shell and heavy for one view. | `GraphView.tsx:40-72`; `scratchpad/smallest-host.ts` | A5, B4, C3 |
| 4.2 | blocker | **Transient view state is modelled as host state.** `overriddenPins`/`onOverriddenPinsConsumed` drive a 600 ms flash whose timer restarts when the callback's identity changes (the catalog has a comment saying it must be `useCallback`); `pendingFocus`/`onFocusConsumed` is an event as state, consumed silently when the target is still filtered out. Focusing a node takes three host steps. | `GraphView.tsx:207-211,392-408`; `examples/course-catalog/App.tsx` reveal | B13, C3 |
| 4.3 | major | **The cross-view target is a name plus dimensions, not a node id.** `FocusTarget = { name, values }`; `matchesFocus` picks the first node that matches, so a copy centres on the wrong one; the host looks its record up again by name and cannot tell which listing was clicked. The `highlight` hook is not told the direction (Shift reverses the walk). | `filter/types.ts:131-134,150`; `GraphView.tsx:398,792`; `graph/ontology.ts:174` vs `useHighlight.ts:91-94` | B17, B18, C2, C12 |
| 4.4 | major | **Missing outputs and inputs.** No selection, click or hover events; no resolved theme (the catalog resolves it again); no positions or camera; no `className`/`style` on the root; no way to hide the control panel or the theme button; no initial layout or tuning prop. | `GraphView.tsx:507-511,618-625,639-655` | B (left out), C3, C10 |
| 4.5 | major | **No layout continuity.** A new identity for `graph` or `ontology` builds a fresh simulation with random seeding; a live-data host loses layout and camera on each update; `createOntology` inline re-lays out every render. The identity requirement is undocumented. | `components/graph-view/useSimulation.ts:68-73`; `graph/rng.ts:22`; `graph/simulation.ts:540-547` | B13, C10 |
| 4.6 | major | **Group colour cannot be chosen.** `NodeGroup` has no `color`. (Stability of the palette's assignment is 1.8.) | `graph/groups.ts:44-49` | B19, C12 |
| 4.7 | major | **`FilterBar` outside the pane rebuilds the pane's internals.** It needs `valuesByDimension`, `recentlyChanged`, `searchInputRef` and the search copy; `valuesOn` is not exported, so a second view writes its own. | `FilterBar.tsx:41-79`; `index.ts` | A9, C15 |
| 4.8 | minor | **`active` is a tab-shell concern living on the view**, and the keyboard scope rides on it (1.4). | `GraphView.tsx:41-43` | A10, C1 |

**Closes with:** required props become `ontology` and `graph` (the context stays as an alternative); every other prop optional with an uncontrolled default; `useGraphViewState(ontology)` for hosts sharing state between views; an imperative ref with `focusNode(id)` (reconcile, flash and centre in one call), `fit()`, `getPositions()`, `setPositions()`; focus and `crossView` by node id, `highlight` given the direction; `onSelectionChange`, `onNodeActivate`, `onHover`, `onThemeResolved`; `className`/`style`, `controls?: boolean`, `themeToggle?: boolean`, `initialLayout`; positions carried across graph updates by node id with a development warning on identity churn; a `keyboard: 'pane' | 'global' | 'none'` prop replacing `active`'s keyboard role; `NodeGroup.color?`; `FilterBar` exported with `FilterBarProps` and a `graph` prop in place of the internals, or not exported.

---

## Set 5 — Model questions: decide before v1, build or file

Each of these changes what the model can say. Decide which are in scope for
the first publish; the rest become issues with the decision recorded.

| id | sev | question | evidence | found by |
|---|---|---|---|---|
| 5.1 | major | **One privileged axis carries colour, size, icon, physics, edge classification and summaries.** "Each feature elects its own axis" holds for filtering and push/pull only; colouring by another axis means a new ontology, which rebuilds the simulation. Is colour-by-axis wanted? | `graph/ontology.ts:48-138`; `GraphCanvas.tsx` style resolution | C1 |
| 5.2 ✓ | major | **Only the style axis and the filter axes can be layout or push/pull axes.** A plain node dimension (term) must become a full filter first; an axis past the value ceiling falls back silently. | `graph/simulation.ts:195-212,265-275` | B20, C12 |
| 5.3 | major | **Multi-parent containment.** Summaries count containment edges while ancestor walks follow `parentId`; two parents give two inconsistent pictures and no error. Either support it or make 3.8's copy rule the stated answer and validate against a second parent. | `visibleGraph.ts:52-67,126-133` | A8, C12 |
| 5.4 | major | **Edge collapse is the library's rule.** Declaration order picks the surviving stroke when graduated edges land on one pair; the host cannot rank types or supply a `collapse` hook. | `visibleGraph.ts:208-219` | B15, C4 |
| 5.5 | major | **`Ontology` exposes the engine's hot path.** `resolveNodeStyle`, `styleForKey`, `valueFor`, `valueOn`, `edgeStrokeFor`, `resolveEdgeType` and `styleAxis()` are public; every internal refactor is a breaking change. An opaque (branded) type with a few read accessors is the alternative. | `graph/ontology.ts:48-138`; `index.ts:32` | C13 |
| 5.6 | minor | **Gaps a host may hit:** undirected edges; per-edge weight or width; search on fields other than `name`; English strings throughout; a chip tint must be a style value. | `GraphCanvas.tsx:556`; `GraphView.tsx:290`; `FilterBar.tsx` tint check | B21, C12 |

---

## Set 6 — Surface trim, packaging, documentation

After Sets 3 and 4 settle the shape.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 6.1 ✓ | minor | **Exports to remove:** `ScalarSpan` (in no public signature), `StyleSubject`, `FilterDimension`, `useRecentlyChanged` (exists to feed `FilterBar`), `relationOf` (keep `isContainment`), the two axis constants (2.1), possibly `themeChoiceOf`. **To add:** `payloadNumber` (the catalog wrote its own), `GraphViewProps`, `withPin`, `toggleGroup`, `defaultFilter`, `validateGraph`, `valuesOn`. | `index.ts`; `graph/scalar.ts:30-44` | B21, C15 |
| 6.2 | major | **The README cannot produce the catalog.** It omits the identity rules, filter seeding, the focus recipe, the two-view pattern, keyboard behaviour, the theming tokens, the collapse rules and the performance limit (the charge force is O(n²)). Writing the catalog required reading four source files. | `README.md`; `graph/forces.ts:678-679` | B13, C18 |
| 6.3 | major | **`createOntology` misses checks the README promises.** Duplicate edge-type ids and duplicate filter-dimension ids (last wins); `sourceType`/`targetType` not among the declared values; `band.min > max`; chip tints deferred to a render-time `console.error`. | `graph/ontology.ts:194-247`; `FilterBar.tsx:21-30` | C7 |
| 6.4 | minor | **The React 19 peer range is untested.** `searchInputRef: React.RefObject<HTMLInputElement>` rejects React 19's `RefObject<T | null>`; dev dependencies pin `@types/react@18`, so the dts gate never sees 19. | `FilterBar.tsx:56`; `package.json` | C17 |
| 6.5 | minor | **`useHostTheme` observes every class change in the document** (`subtree: true`), a cost in large hosts; resolved by 2.3's prop. | `useTheme.ts:68-69` | C18 |
| 6.6 | minor | **Small presentation gaps.** Filter rows have no axis heading; search results show the raw value, not its label; the node glyph is always white; `payloadString` reads strings only. | `FilterBar.tsx`; `GraphView.tsx:599`; `GraphCanvas.tsx:891`; `graph/model.ts:77-83` | B21 |
| 6.7 | minor | **The course-catalog example is untracked.** It is the second host the README should be able to produce and the fixture for 1.1, 2.1, 3.1 and 4.3. | `tools/graph-view/examples/course-catalog/` | this session |

**Closes with:** the entry rewritten against the shipped surface gate list; a README with a compiling quick start, the state and identity rules, the focus and two-view recipes, the theming tokens, keyboard behaviour, collapse rules and limits, tested by writing the catalog from it alone; a dts gate run against `@types/react@19`; the example committed under `examples/` and reached by the harness.

---

## Sequencing and dependencies

1. **Set 1** stands alone and ships first; nothing in it changes the surface. 1.4's fix lands with 4.8's `keyboard` prop or defaults to pane scope.
2. **Set 2** follows. 2.1 needs the descriptor presentation field, which is a small forward piece of Set 3; do it in Set 2. 2.3's `hostTheme` prop is part of the Set 4 contract; land the prop in Set 2 and keep the sniffing as the fallback until Set 4 removes it.
3. **Sets 3 and 4 together** are the one breaking migration for both hosts: the spec shape and the props change in the same unit so the visualizer and the catalog move once. 3.1's `defaultFilter` is what makes 4.1's uncontrolled mode possible; 3.3's derived indexes are what let 4.3 focus by id without the host's lookup.
4. **Set 5** is a decision pass before Sets 3 and 4 are designed: 5.1 and 5.2 change what the spec declares, 5.4 changes what 1.1's fix exposes, 5.5 changes what Set 6 trims. Decide each as in, deferred with an issue, or declined with the reason in DECISIONS.md.
5. **Set 6** closes: trim, gates, README, example committed.

Every set keeps `make check-visualizer` green and ratchets `kickoff/gates.json`; Sets 2 to 4 each get a rule-12 review and a `REVIEW_<n>.md`.

## Decisions needed

- Scope of the first publish: which of Set 5 is in.
- Whether the first host's spec and shell migrate in one unit (recommended) or the library carries both shapes briefly. AGENTS.md's pre-v1 rule says no shims, so one unit.
- The package name and whether the first publish happens from this stack or after Sets 1 to 4.
- Whether `examples/course-catalog/` is committed now, as the fixture these sets need, or with Set 6.
