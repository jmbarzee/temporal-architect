# graph-view API, second pass: issues and sets of work

The issues found by the second cold review of `@temporal-architect/graph-view`'s
public surface at `cb4e99d` — after the six sets of `API_WORK.md` — organised
into six sets of work. Each item names its evidence, its severity as the
reviewer gave it, and the change that closes it. The sets are ordered so that
each one leaves the library shippable: the footguns first, then the two
breaking redesigns in pairs so the hosts migrate twice at most, then the
renames last, with a codemod, so no other set's diff fights them.

Per AGENTS.md the backlog lives in GitHub issues. This file is the organising
draft; when a set is scheduled, its items are filed (one issue per item, one
epic per set) and this file points at them.

**Sources.** R: the independent review by an agent given the entry, the shapes,
the README and the two condensed hosts and nothing else (section 3 of the
second review page). A citation `file:line` is the reviewer's; ✓ marks an item
re-checked in the source by this session. Two of the reviewer's defects were
fixed before the plan was drawn (`cb4e99d`: the double-click handler's stale
graph, the hover box's action handing over the simulation's node) and are
not listed.

**Line numbers** refer to `tools/graph-view/src/` at `cb4e99d` unless the path
says otherwise. **Severity** is the reviewer's: blocker, a stranger ships a
broken host unwarned; major, a stranger hits it and must work around it;
minor, friction.

---

## Set 1 — Footguns and false docs, no API change needed

Fix first. Nothing here changes a public name; each code item gets a harness
probe that fails before the fix, each doc item a corrected sentence.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 1.1 ✓ | blocker | **The uncontrolled filter is seeded once, from the first graph.** A host that mounts with an empty graph while its data loads seeds every allow-list axis empty, which `passesSelection` reads as "show nothing"; the data arrives and the pane stays blank with no diagnostic. Values first seen in a later graph start hidden. | `GraphView.tsx:106,168`; `filter/types.ts:176-178` | R |
| 1.2 ✓ | major | **The keyboard takes keys it should leave alone.** No modifier check, so Cmd/Ctrl+F and browser zoom are cancelled; in `global` scope Tab is captured from `body`, so a keyboard user cannot Tab into the host page; Escape is cancelled even when nothing handles it. | `GraphView.tsx:562-648,570-583,589-590` | R |
| 1.3 ✓ | major | **Two docs say the edge rule sees live endpoints; the code classifies on the original ones.** The README says the rule "must answer … for a graduated edge whose end moved"; the `Ontology` doc says values are "read live … graduation re-points"; the view says strokes come from "the type the derivation resolved on the edge's ORIGINAL endpoints", which is what happens and what `validateGraph` checks. A stranger cannot tell which pairs the rule must cover. | `README.md:107-110`; `graph/ontology.ts:117-122`; `GraphView.tsx:318-321`; `validate.ts:81-95` | R |
| 1.4 ✓ | major | **Outputs hand back objects that are not the host's.** `onSelectionChange`, `onHover` and `onNodeActivate` look nodes up in the derived graph, which `dropInvalid` copies when it clears a bad parent; an identity check in the host breaks in some cases and not others. (The hover box's action was fixed in `cb4e99d`.) | `GraphView.tsx:440,443,453`; `validate.ts:127` | R |
| 1.5 ✓ | minor | **`onSelectionChange(null)` and `onHover(null)` fire on mount.** A host that closes a panel when the selection goes null gets a spurious close. | `GraphView.tsx:439-444` | R |
| 1.6 ✓ | minor | **`edgeStrokeFor` throws** although the module header promises resolution never throws. | `graph/ontology.ts:10,292-296` | R |
| 1.7 ✓ | minor | **The first paint can use the wrong theme.** `useHostTheme` seeds its state from `ref.current`, null on the first render, and corrects itself in a passive effect. | `useTheme.ts:55-58` | R |
| 1.8 ✓ | minor | **A derived containment edge can vanish.** When a host edge already carries the id `in:<node>`, the derived edge is skipped without a word. | `graph/model.ts:164-165` | R |
| 1.9 ✓ | minor | **`UNDECLARED_TINTS` is module-global**, the process-wide de-duplication the taxonomy's own warning rejects because it hides a second taxonomy's mistake. | `FilterBar.tsx:22`; `graph/ontology.ts:298-302` | R |
| 1.10 ✓ | minor | **Two inputs are read once without saying so.** `positions` is read only when the simulation is built; an `ontology` rebuilt per render gets none of the identity warning `graph` gets. | `GraphView.tsx:85`; `useSimulation.ts` | R |
| 1.11 ✓ | minor | **README errors.** The colour variable is kebab-cased (`--gv-node-nexus-endpoint`), not `--gv-node-<value>`; `toggleValue` is not among the operations the bar uses; `FilterBar` does not "default the rest" (see 5.1); the package is ESM-only and the README does not say so. | `README.md:194-199,212-213`; `graph/scheme.ts:38-52`; `FilterBar.tsx:37` | R |

**Closes with:** the uncontrolled filter re-seeded on a graph change while the user has not touched it, and values first seen on an axis still at its default selection added to it; `handleKey` returning early on a modifier, never claiming Tab from `body`, and cancelling only the keys it handled; one sentence in the README and the `Ontology` doc saying the rule classifies on the original endpoints and the type is carried through graduation; every output looking up `hostGraph.nodes.get(id)`; the mount-time callbacks suppressed; `edgeStrokeFor` returning a fallback stroke with one warning; the theme read before paint; a derived edge given a distinct id or named in a diagnostic; the tint warning per bar instance; a one-time warning for an ontology whose identity churns; the README corrected.

---

## Set 2 — The taxonomy: classification and the remaining defaults

Breaking for both hosts (the rule becomes optional, the stroke optional, the
suffix rule changes); done with Set 3 so the hosts migrate once.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 2.1 ✓ | major | **`resolveEdgeType` is required and restates the table.** `EdgeType` already declares `relation`, `sourceType` and `targetType`, but those drive only the split-colour token; both hosts re-encode their table — the catalog a `CONTAINMENT_BY_CHILD` map, the visualizer a `has(a, b)` ladder over pairs. | `graph/taxonomy.ts:149-157`; `surface-catalog.ts:7,98`; `surface-visualizer.ts:156-167` | R |
| 2.2 ✓ | major | **Non-ASCII value ids are refused.** `cssSuffix` maps every non-alphanumeric run to `-`; an empty or shared suffix throws at construction, so `'研究室'` cannot be a value and `'café'` collides with `'cafè'`. A host whose values come from data cannot build a taxonomy. | `graph/scheme.ts:41`; `graph/ontology.ts:219-226` | R |
| 2.3 ✓ | minor | **Edge strokes have no defaults** — all four fields required, while a node style needs three. | `graph/taxonomy.ts:161`; `graph/scheme.ts:27-32` | R |
| 2.4 ✓ | minor | **`filterDimensions` is required**; the quick start declares exactly what the default would be (the style axis as an allow-list). | `graph/ontology.ts:154` | R |
| 2.5 ✓ | minor | **`reheat?: Partial<ReheatPolicy>` exposes the simulation's internals** — `alpha`, `seedRevealed`, `refit`, `resume` — that no stranger can choose. | `graph/dimension.ts:76-85,126` | R |
| 2.6 ✓ | minor | **The descriptor's naming defaults do not compose.** `abbreviationFor` defaults from the raw value, not from `labelFor`; there is no `tooltipFor`, so a tooltip means rewriting `chipsFor`; a custom `chipsFor` must drop chips for absent values itself. | `graph/dimension.ts:183`; `surface-visualizer.ts:175-183`; `surface-catalog.ts:129` | R |
| 2.7 ✓ | minor | **Each scalar must normalise itself** to [0, 1]; the library's `normalized` is private and both catalog scalars hand-roll a divide-by-max. | `graph/scalar.ts:16-21,145`; `surface-catalog.ts:146-159` | R |
| 2.8 ✓ | minor | **Band numbers have no frame of reference.** The stack is −300…400 and x is 0…380 in world units; a host reads neither anywhere, and the visualizer's `y: { min: -340, max: -120 }` is a number a stranger could not write. | `graph/taxonomy.ts:174-175`; `README.md:95-96` | R |

**Closes with:** classification defaulting to the one declared type whose (relation, sourceType, targetType) matches in either orientation, the rule becoming an optional tie-breaker (`classifyEdge?`) that construction demands only when two declared types share a pair; the custom-property suffix kept where it is unique and non-empty and otherwise numbered (`--gv-node-v3`), with `colorVar` exported and the rule documented; a default stroke (neutral, solid, alpha 0.7, width 1.2); `filterDimensions` defaulting to the style axis as an allow-list; `reheat` replaced by `keepCamera?: boolean`; `abbreviationFor` from `labelFor`, a `tooltipFor`, and chips with no present value dropped by the bar; scalars returning raw numbers with `normalize?: 'max' | 'none'`; the frame documented in the README and the stack's bounds exported as one constant.

---

## Set 3 — The graph model

Breaking for both hosts; done with Set 2.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 3.1 ✓ | major | **`relation` is a reserved key inside a map the host owns.** `RELATION_DIMENSION = 'relation'` sits in `GraphEdge.dimensions` beside the host's own axes, so a host axis named `relation` collides; the hosts already spell it two ways (`[RELATION_DIMENSION]` in the quick start, a bare `relation:` in both condensed hosts). | `graph/dimension.ts:451`; `graph/model.ts:114-122` | R |
| 3.2 ✓ | minor | **Containment can be written two ways** — `parentId`, or containment edges "between any two nodes" with a warning when they disagree — and nothing says what a containment edge that is not the parent does to `ascend`. | `README.md:141-142`; `validate.ts:98-106` | R |
| 3.3 ✓ | minor | **`Graph` is typed as mutable** (`Map`, `GraphEdge[]`), so a host's `readonly` data does not typecheck, and nothing checks that a Map key matches its node's `id`. | `graph/model.ts:188-191` | R |

**Closes with:** `GraphEdge.relation?: Relation` as a field defaulting to `dependency`, `RELATION_DIMENSION` gone, `Relation` earning its export; one stated rule for a containment edge that is not the parent's — drawn and sprung, never walked by `ascend` or counted twice — or `parentId` as the only way (see Decisions needed); `ReadonlyMap` and `readonly GraphEdge[]` on `Graph`, and `validateGraph` naming a key that is not its node's id.

---

## Set 4 — The component contract, second pass

Breaking (two props move); done with Set 5.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 4.1 ✓ | major | **Selection is the one state a host cannot control.** Only `onSelectionChange`; the only way to set it is `focusNode`, which also widens filters and moves the camera. A details panel that closes cannot clear the pane's selection. | `GraphView.tsx:122-123`; `surface-catalog.ts:252-253` | R |
| 4.2 ✓ | major | **A host cannot turn the chrome off.** The pin toggle on every axis (meaningless in a single-view host), chain editing (unless controlled without a callback), the search control, the Fit / Play / fps / count cluster, the shortcuts panel, the in-pane diagnostics list, the hover box's "dependencies / dependents" line, the double-click zoom, the console warnings; `controls={false}` hides only the force panel, and the pane's search strings are hard-coded though the bar takes them as props. | `GraphView.tsx:746-747,754,775-804,968`; `FilterBar.tsx:227-232` | R |
| 4.3 ✓ | minor | **The handle is thin.** No `select(id \| null)`; `focusNode` returns true even when the node stays hidden (an absent value on an `absentMeans: 'hidden'` axis), so a host cannot tell a reveal from a failure. | `GraphView.tsx` (the handle) | R |
| 4.4 ✓ | minor | **A focus into a lazily mounted pane must be queued by the host**, because the handle does not exist before mount and there is no selection prop. | `surface-visualizer.ts:329-336` | R |

**Closes with:** `selectedId?: string \| null` with `onSelectionChange` as its callback, and `select(id \| null)` on the handle; `focusNode` answering whether the node ended visible; `chrome?: { search?, pins?, transport?, diagnostics?, shortcuts?, directionLine?, activateZoom? }` with every part on by default, and `searchTitle` / `searchPlaceholder` passed through to the bar; a `focusId?` prop or a documented pattern for the lazy mount (see Decisions needed).

---

## Set 5 — `FilterBar` and the two-view story

Breaking for the first host's tree bar; done with Set 4.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 5.1 ✓ | major | **`FilterBar` does not "default the rest".** `filter`, `onFilterChange`, `pins` and `onPinsChange` are required; the bar reads the taxonomy only from context and throws without a Provider, though `GraphView` takes `ontology` — which is why both hosts wrap a Provider around a component that already takes the prop. | `FilterBar.tsx:64-67,121`; `README.md:194-196`; `surface-visualizer.ts:305`; `surface-catalog.ts:244` | R |
| 5.2 ✓ | major | **The second view recomputes what the pane computes internally.** The hidden-match tally is inline code the comment calls shareable; `countsOn` is unexported beside its exported sibling `valuesOn`; the visualizer's tree bar supplies its own counts, hidden matches, overridden pins and search badge. | `GraphView.tsx:393-395`; `graph/dimension.ts:374`; `surface-visualizer.ts:343-366` | R |
| 5.3 ✓ | minor | **The pin flash needs plumbing in the host** outside the pane: the host clears `overriddenPins` itself, while the pane uses a private 600 ms timer. | `GraphView.tsx:301-308`; `FilterBar.tsx` | R |
| 5.4 ✓ | minor | **`reconcileFilter` takes five positional arguments**, two of them adjacent `FilterState`s; swapping them compiles. Nothing says `axes` should be the destination's chain, and passing every declared axis revives selections the bar reset when the user removed an axis. | `filter/reconcile.ts:32-38`; `FilterBar.tsx:236-255` | R |
| 5.5 ✓ | minor | **`FocusTarget.name` does nothing for a host**: the reconciler reads only `values`; `matchesFocus`, the one reader of `name`, is not exported. | `filter/reconcile.ts:91-115`; `filter/types.ts:150` | R |
| 5.6 ✓ | minor | **Two one-off events ride awkwardly on props.** `refreshFlash?: boolean` stays set, so flashing again means resetting it first; `recentlyChanged` keys are `` `${axis}:${value}` `` strings, ambiguous when an id contains `:`. | `FilterBar.tsx:70,89-90,198` | R |
| 5.7 ✓ | minor | **Nothing says how a bar outside the pane gets its theme.** `schemeStylesheet` applies dark values under `[data-theme="dark"]`, the README forbids writing the resolved theme onto an ancestor of the pane, and the one correct move — `onThemeResolved` into a `data-theme` on the bar's own wrapper — is unstated. | `graph/scheme.ts:135`; `README.md:176-179` | R |

**Closes with:** `ontology?` on `FilterBar`, `pins` / `onPinsChange` optional (no toggles when absent), and the README sentence made true; `countsOn` and a `hiddenMatchesOf(subjects, filter, axes, valueOn, matches)` exported, so a second bar gets counts, hidden matches and the badge from one call each; the bar owning the pin flash from a changing `overriddenPins` value; `reconcileFilter` taking an options object and documenting `axes` as the destination's chain; `FocusTarget` reduced to `values`; `refreshFlash` as a counter and `recentlyChanged` as a map from axis to values; the theme recipe for an outside bar in the README.

---

## Set 6 — Vocabulary, the first host's residue, the surface

Last, as one rename unit with a codemod over both hosts and the harness, so
no other set's diff fights it.

| id | sev | issue | evidence | found by |
|---|---|---|---|---|
| 6.1 ✓ | major | **Several names mean one thing, and one name means several.** Taxonomy or ontology (`createOntology` returns an `Ontology`; the README and the error say "taxonomy"); axis, dimension or chain (`DimensionId`, `filterDimensions`, `styleAxis()` beside `styleDimension`, `chain`); "resolve" means fill in defaults, classify, and look up; "pin" means an axis locked and a node fixed; "focus" means five things; `sourceType` holds a style value; `valueOn` / `valueFor` / `valuesOn` are near-homonyms. | `graph/ontology.ts:277`; `filter/types.ts:46`; `GraphView.tsx:62` | R |
| 6.2 ✓ | minor | **The first host's vocabulary is still in the package.** The public classes `gv-header-types-section` and `gv-header-file-tag`; doc comments saying "A file chip shows its basename", "e.g. \"Endpoint\"", "`2 Wk · 1 Ep`"; the README's claim that a ratchet holds that vocabulary at zero, which does not scan class names. | `FilterBar.tsx:95-96`; `graph/dimension.ts:50-52`; `graph/taxonomy.ts:43,92`; `README.md:12-13` | R |
| 6.3 ✓ | minor | **Exports to remove:** `toggleValue` (the bar does not use it), `useHostTheme` (a pane internal), `copyKeyOf` (a one-liner), `ReheatPolicy` (with 2.5). **To add:** `colorVar`, `countsOn`, `hiddenMatchesOf`, `filterStatesEqual` (a host controlling the filter needs it), and the types that appear in exported signatures but are not exported — `AxisNamer`, `StyleSubject`. | `src/index.ts` | R |
| 6.4 | minor | **`Ontology` is a plain interface** a host can build by hand, skipping every check. Branding is [#195](https://github.com/jmbarzee/temporal-architect/issues/195). | `graph/ontology.ts:50-127` | R |
| 6.5 ✓ | minor | **The ref prop rejects React 19's `useRef(null)`.** `searchInputRef?: React.RefObject<HTMLInputElement>`; the gate for React 19 is [#200](https://github.com/jmbarzee/temporal-architect/issues/200), but the widening to `RefObject<HTMLInputElement \| null>` needs no dependency. | `FilterBar.tsx:76`; `package.json:52` | R |

**Closes with:** one word each — "taxonomy" (`createTaxonomy`, `Taxonomy`, `TaxonomySpec`) and "axis" (`AxisId`, `styleAxis`, `filterAxes`, `AxisDescriptor`, `axes` for the chain) — and `classifyEdge`, `nodeAction: { label, onSelect }`, `sourceValue` / `targetValue`, `styleOf` alone (no `resolveNodeStyle`), `valueOn` alone, `AxisLocks` for the pin state; the chip classes `gv-chip-*` and `gv-tag-*` and neutral doc examples, with the leak gate's registry extended to class names; the exports as listed; the ref prop widened. A codemod script moves both hosts and the harness; the surface list and the README follow.

---

## Already closed

- The double-click handler closing over its first graph, and the hover box's action handing the host the simulation's copy of a node (R §4, §9) — `cb4e99d`.
- Colour by another axis, an opaque `Ontology`, undirected edges, per-edge weight, the pane's strings: filed as #194–#198 (D72); the React 19 gate as #200 (D73). 6.4 and the strings item in 4.2 reference them rather than re-plan them.

## Sequencing and dependencies

1. **Set 1** stands alone and ships first; nothing in it changes a public name. 1.1 is the blocker and gets the first probe.
2. **Sets 2 and 3 together** are one breaking migration for both hosts: the edge rule becomes optional and `relation` becomes a field in the same unit, so each host's edge-building code moves once.
3. **Sets 4 and 5 together** are the second: the selection prop and the chrome toggles land with the bar's `ontology` prop and the exported counting helpers, so the visualizer's tree bar and the catalog's details panel each move once.
4. **Set 6** closes with the rename codemod. It is last because every other set's diff would otherwise be rewritten by it; its codemod is applied to the hosts and the harness in the same commit.
5. Each set keeps `make check-visualizer` green, regenerates goldens only under a DECISIONS entry, and ends with a PR stacked on the one before, from `graph-view/unit-16` on `graph-view/unit-15`.

## Decisions needed

- **`relation` as a field (3.1).** Recommended: yes — pre-v1, and it ends the two spellings. The alternative keeps the axis and documents the reserved key.
- **Containment edges that are not the parent's (3.2).** Recommended: keep them (the first host's routing edges need them) with the stated rule — drawn and sprung, never walked by `ascend`, never counted as a child — and a diagnostic when one contradicts `parentId`. The alternative, `parentId` only, moves the routing edges to a dependency relation with their own axis.
- **How far the renames go (6.1).** Recommended: the full list above in one unit, with the codemod. The alternative renames only the overloaded words (`resolve`, `focus`, `type`) and keeps "ontology" and "dimension", which cost less now and leave the vocabulary mixed.
- **The chrome prop's shape (4.2).** One `chrome` object with on-by-default parts, or one boolean prop per part. Recommended: the object.
- **The lazy-mount focus (4.4).** A `focusId?` prop the view consumes when it can, or the documented queue the visualizer wrote. Recommended: the prop, since `selectedId` already makes selection declarative.
- **Non-ASCII suffixes (2.2).** Numbered fallbacks (`--gv-node-v3`) keep the readable names where they work; a hash would be stable across reorderings but unreadable. Recommended: numbered, with `colorVar` as the one way to learn a name.
