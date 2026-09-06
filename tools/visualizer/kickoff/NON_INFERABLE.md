# Environment: Constraints & Facts

**§4 of the kickoff set. [immutable].**

> Admission test for this file: if you could infer it by reading the code, it
> does not belong here. Everything below is non-inferable, non-negotiable, or
> actively counterintuitive — a trap that has already been walked into, or one
> the structure of the code invites.

Line references were verified at kickoff against the tree at `main`. If one no
longer matches, trust the surrounding description and log the drift in
`PROGRESS.md`.

---

## 4.1 Hard constraints

Invariants that must hold. Violating one is a §8.3 halt, not a judgment call.

### C1 — The Go parser and its JSON output are frozen

No changes to `tools/lsp/`, and no changes to the wire contract in
`tools/wire-types/`. Not additive ones either. Every impedance mismatch between
what the parser emits and what the library wants is absorbed by the shim. If you
find yourself wanting a new field on `ParserNode`, you have found a shim
responsibility, not a parser gap.

### C2 — No new third-party dependencies

Not runtime, not dev. The verification harness is deliberately bespoke and
zero-dependency for this reason (see T33 for why it cannot even use
`@types/node`). If a task appears to require one, halt (§8.3).

**Two carve-outs, pre-approved so the plan does not deadlock on its own
literalism:**

1. A **workspace-local `file:../<sibling>` link** between packages in this
   repository is not a new dependency. Precedent: the visualizer already consumes
   `@temporal-architect/wire-types` exactly this way. Unit 8 needs it.
2. **Hand-written ambient declarations** for platform builtins, authored in this
   repo, are not a dependency. Prefer avoiding the need entirely — the harness
   design in `VERIFICATION.md` §3.1.1 does — but if one becomes unavoidable,
   write it rather than halting.

Anything else — including switching `vite.lib.config.ts` to `bundleTypes: true`,
which pulls in `@microsoft/api-extractor` (T31) — is §8.3.

### C3 — The public library surface

`src/lib.ts` is the entire npm-visible API. Two facts about it matter:

- **`ForceParams`, `Simulation`, and `DEFAULT_PARAMS` are NOT exported.** No
  consumer can name a single force parameter. The whole force model is private,
  which means it is free to be renamed and reshaped without a breaking change.
  This also invalidates the premise of issue #90 ("renaming `gravityDownstream`
  is breaking for library consumers") — it is not.
- **`StyleGuide` IS exported** (`lib.ts:23`) and is 370 lines of hardcoded
  Temporal JSX. Moving it to the shim is a real breaking change to
  `@temporal-architect/visualizer`. That decision is §8.3.

### C4 — Downstream consumers

The distribution repo (`jmbarzee/temporal-architect-dist`) builds the VS Code
webview from the **published, version-pinned** visualizer library. You never edit
that repo. But note: its webview reads the *same* `localStorage` key as the
standalone app — `temporal-architect-visualizer-state`. A persisted-state shape
change reaches it.

### C5 — Pre-v1 repository stance

Breaking changes are expected and welcome. Do **not** write backwards-compat
shims, deprecated field aliases, or migration paths for internal APIs. When a
better design emerges, adopt it directly. Never run a major release.

### C6 — Worktree discipline

Work happens in a git worktree. Three rules, each learned the hard way:

- Keep `cwd` inside the worktree and use paths relative to it. A repo-root
  absolute path resolves against the **main checkout**, not the worktree.
- Never `rm -rf` using a path that could resolve outside the worktree. `ls` the
  target first.
- Never bare `git stash` / `git stash pop` — the stash stack is shared with the
  main checkout and other concurrent sessions. Use a WIP commit instead.

### C7 — Go commands

Prefix every `go` invocation with `GOMODCACHE=$HOME/go/pkg/mod`. See the "Running
`go`" section of the repo's `AGENTS.md` for why. You should rarely need this —
the only Go you touch is `twf` for fixture generation, which is already built and
on `PATH`.

---

## 4.2 Non-inferable facts

Numbered so other documents and review findings can cite them.

### Silent-failure traps

**T1 — Value-vs-identity equality. The single most dangerous trap in this work.**
`forces.ts:196` is `new Set<NodeType>()` and `forces.ts:262` is
`new Map<NodeType, number>()`. Both deduplicate by **string value**. A composite
dimension object has *identity* equality, so both silently degenerate to one
entry per node. `medianBandCenter` then takes the median over one centre *per
node* instead of one per type, which shifts the whole band stack vertically.
The radial half is subtler: `applyBandGravityRadial` writes and reads its Map
with the same key reference, so losing dedup changes only `center.size` — `lo`,
`span` and every `targetR` stay identical and the rings do **not** move. That is
what makes it easy to miss. It becomes a total loss of radial tiering only if
the key is derived per-node rather than stored on the node. No type error. No
crash.
→ Dimension selections must resolve to a **stable interned string key** before
they are ever used as a `Set`/`Map` key. `VERIFICATION.md` Tier B invariant 2
exists solely to catch this.

**T2 — Band gravity is also the seeding function.** `simulation.ts:265-292`
(constructor) and `seedAt` (~`:423-431`) place nodes *inside*
`bandForType(params, node.nodeType)`. The comment at `:260-262` states the
purpose explicitly: so the first tick does not have to violently relocate them.
Making bands per-chosen-dimension therefore requires a defined fallback when that
dimension is absent from a node, or the first frame does exactly what the seeding
was written to prevent.

**T3 — `bandForType` has no guard and fails hard; its siblings fail soft.**
`forces.ts:41-44` dereferences `b.min` with no undefined check — a missing key is
an immediate `TypeError`. Its two siblings fail *differently and quietly*:
`chargeForType` returns `undefined`, while `coreRadiusForType` returns `NaN`
(its `Math.max(..., CORE_RADIUS_MIN)` floor swallows the miss). The `NaN` enters
first, at `forces.ts:112-115` via `rEffA`/`rEffB`, and both reach velocity at
`:118,121`. Add a defaulting accessor **before** the key space opens.

**T4 — `definitionFor` has no undefined guard, and its failure mode is
unstyled.** `node-types.ts:322-324` is a bare `NODE_TYPE_REGISTRY[t]`. An
unmapped key throws inside the rAF draw loop — and **nothing catches it.** React
error boundaries do not cover `requestAnimationFrame` callbacks, only render,
lifecycle and constructors. `CanvasErrorBoundary`'s own header comment claims
otherwise ("A throw in `<GraphCanvas>`'s render **or in its
requestAnimationFrame draw loop** … catches such errors"); that comment is
wrong. Do not trust it.

The actual failure mode is worse than a fallback: `GraphCanvas.tsx:1124` calls
`drawFrame()` and only *then* re-schedules at `:1126`, so a throw kills the loop.
The canvas **freezes** on the last good frame, with no error UI and no console
boundary — it looks like a hang, not a lookup failure. (For completeness: the
fallback class `.graph-canvas-error` also has no CSS rule anywhere in `src/`, so
even the paths that *do* reach the boundary render unstyled text.)

And the boundary is narrower than it looks: `CanvasErrorBoundary` wraps only
`<GraphCanvas>`, so the two *render-path* callers — `GraphView.tsx:692` (tooltip)
and `useVisibleGraph.ts:155` (summary dispatch) — sit **above** it and blank the
whole tree instead. Three call sites, three different failure modes, none of them
the one the code's comment promises.

**T5 — Filter memoization is set-*identity* based, not content based.**
`useVisibleGraph`'s deps are `[visibleTypes, selectedFiles, simVersion]`, and
`useSimulationLoop:126,156` compare `prev === visibleTypes` by reference. This
works today only because `FilterBar` always constructs fresh `Set`s. A
`Record<DimensionId, Set<string>>` must **preserve per-dimension `Set` identity
across unrelated dimension edits**, or every dimension change re-runs the full
edge-graduation pass and reheats the simulation.

**T6 — `withAlpha` only parses `#RRGGBB`, and the failure is loud in the worst
way.** `GraphCanvas.tsx:147-153` does `parseInt` on fixed slices. Any
consumer-supplied colour that is a CSS variable, `rgb()`/`hsl()`, 3-digit hex, or
a named colour yields an unparseable `rgba()` string — all-`NaN` for `var(...)`
and named colours, partially-`NaN` for `rgb()` and 3-digit hex. That string then
feeds `grad.addColorStop` at `GraphCanvas.tsx:563-565`, which **throws
`SyntaxError`** — inside the rAF draw loop, where per T4 nothing catches it and
the canvas freezes. It does not quietly drop the glow. A library accepting
arbitrary palette input must normalize before this point.

### Behaviors that look like bugs but are load-bearing

**T7 — The two existing dimensions have opposite empty-set semantics.**
`visibleTypes` empty = **hide everything** (`useVisibleGraph.ts:231`,
`TreeView.tsx:232`). `selectedFiles` empty = **show everything**
(`useVisibleGraph.ts:226,232`). `reconcile.ts:57-62` documents why: adding a file
chip while the filter is off would "inadvertently activate the filter and hide
everything else."
A third nuance: `useVisibleGraph.ts:232` is
`hasFileFilter && node.sourceFile && !selectedFiles.has(...)` — a node with **no**
`sourceFile` is always visible.
→ A uniform dimension model needs both an `emptyMeans: 'all' | 'none'` and an
absent-value policy **per dimension**, or it inverts one of them.

**T8 — The reconciler's two focus policies are asymmetric.** At
`reconcile.ts:75-78` types expand **unconditionally**. At `:80-86` files expand
**only when the file filter is already active**
(`destFilter.selectedFiles.size > 0`). A naive `for (const dim of dims)` loop
flattens this and changes behavior.

**T9 — The two reheat policies are asymmetric.**
`useSimulationLoop.ts:123-148` on a **type** change: seed newly-revealed nodes at
their nearest visible ancestor, `reheat(0.5)`, `setRunning(true)`,
`initialFitDone = false` (i.e. refit). `:151-163` on a **file** change:
`reheat(0.3)` **and `setRunning(true)`** — but no ancestor seed and no refit,
with the comment "files aren't structural." Those two omissions are the *only*
differences; a descriptor derived from a careless reading of "reheat(0.3) only"
would drop `setRunning` and leave the simulation frozen after every file toggle.
Preserve these as per-dimension descriptor fields, not as a shared loop.

**T10 — `ForceParams` flatness is deliberate.** `simulation.ts:42-48` states the
four-way category split is "purely at the type level" precisely so that
`keyof ForceParams`, the key-addressed sliders, the per-type lookup records, and
the shallow merges all keep working. `GraphControlPanel.tsx:59-61`'s
`NumericForceKey` mapped type depends on it. Nesting params under per-dimension
sub-objects silently degrades that mapped type to `never` and breaks every
`SliderDef`.

### Duplication and divergence already present

**T11 — Two independent edge classifiers that already disagree.**
`edgeTypeFor` (`edge-types.ts:108-140`) decides **spring physics** from
`(edgeType, srcType, tgtType, dispatchKind)`. `edgeStyleFor`
(`GraphCanvas.tsx:164-207`) independently decides **colour/dash/width** from the
same endpoints with **different rules**, and additionally reads
`edge.nexusEndpoint != null` (`:184`) — which `edgeTypeFor` never consults.
Neither derives from the other. Replace one and you inherit the divergence in
the other.

**T12 — Band maths is duplicated across physics and renderer, and the copies
diverge.** `forces.ts:195-208` (median re-centering) and `:260-276` (radial
radius mapping) are re-derived at `GraphCanvas.tsx:864-866` and `:846-851`. Worse,
the canvas radial branch iterates only types **present** in the visible set
(`:833-839`) while the cartesian branch iterates **`ALL_NODE_TYPES`** (`:868`),
drawing stripes for types with zero visible nodes. Parameterizing by dimension
must land in both, in lockstep, and must pick one semantics.

**T13 — `--color-workflow` and `--color-activity` are defined twice.**
`src/styles/index.css:11-15` defines them statically; `node-type-styles.ts:36-37`
emits them again from `cssVarSuffix`. Resolution is by document order only — the
injected `<style>` is appended to `head`, so it wins. Do not assume
`node-type-styles.ts` is the sole emitter.

**T14 — `edgeTypeFor` has 15 ids but 16 matched cases.**
`edge-types.ts:132` and `:134` both resolve to `linkWorkflowToOperation`, so
`nexusOperation ↔ nexusOperation` is silently tuned by the `Wf→Op` slider. Rule
**order** is load-bearing (see the comment at `:103-107`), and
`dispatchKind === 'signalSend'` **must** be tested first (`:129`) because both
endpoints are `workflow`. Two catch-all fallthroughs (`:124`, `:137`) silently
classify anything unmatched.

### Cross-boundary couplings

**T15 — The canvas is theme-invariant.** `GraphCanvas.tsx:944-945` reads
`def.color.fill` / `def.color.border` and **never** `fillDark` / `borderDark` —
those appear only in `node-types.ts` and `node-type-styles.ts`. So the DOM chrome
switches theme via `--color-<suffix>` while canvas node bodies do not. Same at
`:677`, `:854`, `:877`, `:975`, `:1001`. Making colour dimension-driven forces
theme-awareness, which **visibly changes every dark-mode graph**. Compounding it:
`nexusOperation` and `activity` omit `fillDark` entirely, so a half-migration
shifts only their borders. `cssVar()` (`:138-143`) already exists and correctly
resolves against the canvas *element* (the theme class sits on `<body>`).

**T16 — The tree view's sort order comes from the graph physics registry.**
`temporal-theme.tsx:3` imports `ALL_NODE_TYPES` and `NODE_TYPE_REGISTRY` from
`graph/node-types.ts`, then derives `DEF_TYPE_CONFIGS` (`:72-77`),
`DEF_TYPE_ORDER` (`:79`) and `VIEW_FILTER_ENTRIES` (`:110-116`);
`WorkflowCanvas.tsx:114` seeds the default visible types from that. So the file
owning charge/coreRadius/yBand also owns which tree rows appear first and which
chips start on. Note `VIEW_FILTER_ENTRIES` uses **direct property access**
(`NODE_TYPE_REGISTRY.namespace.icon`), which defeats dynamic-key generalization
at those exact call sites.

**T17 — The shared filter bar depends on the tree half's stylesheet.**
`FilterBar.tsx:337` renders `<span className="block-toggle">`, and
`.block-toggle` is defined **only** in `components/blocks/blocks.css:248`. Move
`blocks.css` wholesale to the shim and the shared severity-bar chevron loses its
styling with **no build error**.

**T18 — The filter bar counts the wrong thing for an agnostic library.**
`FilterBar.tsx:22` takes `ast: TWFFile` and `:84-95` walks `ast.definitions` for
chip counts. But the graph filters *nodes*, and one definition can produce several
deployment nodes (`build.ts:176-181`). Counting nodes instead is a **visible
number change**, not a pure refactor.

**T19 — Two type vocabularies, bridged lossily.** Physics is keyed by `nodeType`
(`'workflow'`); the filter is keyed by AST `defType` (`'workflowDef'`);
`nodeDefType.ts:16-22` bridges them with silent `?? 'workflowDef'` / `??
'workflow'` fallbacks. The registry declares **seven** defTypes but the AST
`Definition` union has **five** — `nexusEndpointDef` and `nexusOperationDef` are
synthetic and can never equal a `def.type`, so those two entries in the shared
`visibleTypes` Set filter the graph but are inert for the tree. The chip layer
hides this: `VIEW_FILTER_ENTRIES` (`temporal-theme.tsx:110-116`) exposes five
chips, and all three nexus defTypes are folded into one `nexus` group chip —
which is *not* inert for the tree, because it also carries the real
`nexusServiceDef`. Contrast `build.ts:98-104`, which **throws loudly** on an
unknown parser kind. Two silent defaults and one loud failure in the same data
path.

**T20 — `definitionKey` embeds the type string.** It is `${kind}:${name}`,
produced by the Go parser, split on the **first** colon at `build.ts:78-82`. It
keys `duplicateGroups`, `groups.ts` member resolution (`:245-258`), the canvas
duplicate badge, and cross-view selection. The parser cannot change, so the shim
owns both the split and the projection — and the library must treat
`definitionKey` as **fully opaque** and never re-derive a type from it.

### Shape facts that reframe the work

**T21 — There is no per-type-pair push matrix today.** Charge coupling is
`(chargeA + chargeB) / 2` with per-pair softening from the two core radii
(`forces.ts:112-118`). Push is **per-value scalars**. Only *pull* has a pair
table (the 15 `EdgeTypeId`s). A real per-pair push matrix would be net-new
physics — treat any request for one as new scope, not a refactor.

**T22 — The two gravity axes are structurally asymmetric.** `gravityX` drives one
global window `[bandXMin, bandXMax]` — two scalars. `gravityY` drives the
**per-type band map** *and* doubles as radial ring strength
(`forces.ts:261,286`). "Two independently-chosen axes" means promoting X to a
per-value band map: a capability addition across params, forces
(`:232-236` vs `:238-246`), the plot
(`GravityControls.tsx:385-411` vs `:150-208`), and the canvas overlay
(`GraphCanvas.tsx:893-908` vs `:862-891`).

**T23 — `GravityBandPlot` is bespoke SVG, not built on `ForceMap2D`.**
`GravityControls.tsx:66-208` is ~143 lines with its own coordinate mapping and
pointer-capture drag. `:396` hardcodes `dual-range dual-range-namespace` for the
**global** X-band slider, borrowing the namespace colour. Budget the axis plot as
new code, not an adaptation.

**T24 — `Dimension` is already taken, and that is a feature.**
`filter/types.ts:25` exports `FilterDimension = 'files' | 'types'`, and
`spec/VIEW_FRAMEWORK.md` has a section titled *§ Per-Dimension Pinning*. Those
two "dimensions" are literally `sourceFile` and `temporalType`. This is not a
name collision to dodge — it is the same concept arriving early. Unify them; the
existing spec section becomes *more* correct, not less.

### Hot-path cost

**T25 — Composed resolution must be hoisted out of the loops.** Per frame the
canvas resolves `definitionFor` **twice** per node — at `:927` (the `nodeCircles`
precompute) and `:932` (the node loop, whose `def`/`fill` locals every later read
at `:964`, `:975`, `:1001` reuses) — plus once per dependency edge at `:616`,
plus an O(n²) label-collision pass (~`:1085-1113`). Per tick the charge
loop does **four record lookups per pair**, O(n²) (`forces.ts:112-117`), and
`applyLinkForce` calls `edgeCategory` → `edgeTypeFor` per edge. Memoize resolved
style and physics per `(node, dimension-selection)` **outside** the loops or the
simulation collapses on the 53-node stress fixture.

### Repository plumbing that is already broken

**T26 — `tsconfig.node.json` references a file that does not exist.** Its
`include` lists `vite.webview.config.ts` (absent) and **omits**
`vite.lib.config.ts`. No command anywhere runs `tsc --build`, so the referenced
project is never compiled and nobody has noticed. Fix it before adding a second
package's build config.

**T27 — The dev-cycle harness cannot see a sibling folder.**
`internal/harness/components.md:21` scopes `visualizer-spec` to
`tools/visualizer/spec/`; `:22` scopes `visualizer` to `tools/visualizer/`
*excluding* `spec/`. A new `tools/<name>/` falls outside **both** — no quality
review, no alignment review, no propagation edge, and no `npm ci` step in
`ci.yml` nor a build target in the `Makefile`. Amend rows `:20-22`, routing
`:56-63`, propagation `:98-101`, and waves `:124-127` in the same unit that
creates the folder.

**T28 — The spec review that owns this design is already broken.**
`.claude/skills/dev-cycle/references/review-quality-visualizer-spec.md:12`
requires reading `tools/visualizer/spec/VIZUALIZER_PRODUCT_REVIEW_PLAN.md` and
calls it authoritative. That file **does not exist** — `spec/` contains exactly
`GRAPH_VIEW.md`, `PRODUCT.md`, `TREE_VIEW.md`, `VIEW_FRAMEWORK.md`. Fix or delete
that reference before relying on the review to vet a dimension redesign.

**T29 — `GRAPH_VIEW.md` contradicts itself.** Line 52 asserts "There is no
numeric `level`/depth field on `GraphNode`… has been removed." Line 133 still
instructs emitting a view node with `level` derived via `nodeLevel()`. The code
has no `level` field. Three live vocabularies coexist in the document — `level`,
`tier`, `ladder` — and *§ Edge Graduation* reasons entirely in the one line 52
says was deleted.

**T30 — Any spec edit commissions a 13-way review.** `components.md:101` makes
`visualizer-spec | Spec | visualizer → review-alignment-visualizer` mechanical,
and that reference hardcodes 13 spec-section ↔ TypeScript comparison units,
including targets an extraction *moves*. Its severity rubric ranks "a spec that
asserts a behavior the code lacks" highest — so rewriting the spec **ahead of**
the code guarantees a large findings file. Land spec edits **with** their code,
never before.

**T31 — `rollupTypes: true` is a silent no-op; there is no type rollup.**
`vite-plugin-dts@5.0.0` re-exports `unplugin-dts@1.0.0`, where the option was
renamed `bundleTypes`. `rollupTypes` is unrecognized and dropped without warning,
which is also why the absent `@microsoft/api-extractor` never matters.
**Consumers are not broken** — the full per-file `.d.ts` tree is emitted into
`dist-lib/` and `files: ["dist-lib"]` ships all of it, so every `from
'./components/...'` in `lib.d.ts` resolves. What is *unmet* is the config's
stated intent at `vite.lib.config.ts:15-16`: "Emit a single bundled `.d.ts` so
consumers' IDEs aren't tempted to suggest deep imports into our internal file
tree." The deep-import surface is currently wide open — directly relevant to R38
and the library boundary. Verify before acting: `head -5 dist-lib/lib.d.ts`
shows relative re-exports into `./components/`, `./graph/`, `./filter/` and
`./types/`, not a self-contained rollup.

**Do not "fix" it by flipping the option.** Real bundling is
`@microsoft/api-extractor`-powered; it is an optional peer dependency and is
absent, so `bundleTypes: true` would pull in a new dependency — C2, therefore
§8.3. Renaming the dead option to `bundleTypes` without that dependency changes
nothing except which failure you get.

**T33 — `@types/node` is not installed, and C2 forbids adding it.** Verified:
`node_modules/@types/` contains only `babel__*`, `estree`, `prop-types`, `react`,
`react-dom`, and the package appears zero times in `package-lock.json`.
`tsconfig.json` `include` is `["src"]` with `lib: ["ES2020","DOM","DOM.Iterable"]`
— so anything under `src/` that touches `node:fs`, `process.argv`, or `__dirname`
fails Gate 1. This directly shapes the verify harness: see `VERIFICATION.md`
§3.1.1 Runner, which splits it into a typechecked pure half that only calls
`console.log`, and an untypechecked `.mjs` half that does the file I/O.

### Fixture reality

**T32 — `signalSend` is unreachable from the entire `.twf` corpus**, and
`decomposition-sample.json` has 0 coarsened edges, 1 source file, and no nexus.
See `VERIFICATION.md` §3.1.1 Tier C and Fixtures for the full measurement and the
required additions.

---

## 4.3 Fast feedback commands

Exact commands, not descriptions. All run from `tools/visualizer/`.

```
./node_modules/.bin/tsc --noEmit          # ~1.6s, the strongest existing gate
npm run build:lib                         # ~2.3s
npm run verify                            # goldens (after Unit 0)
npm run verify -- --write                 # regenerate goldens (needs §8.2 log entry)
npm run leak-gate                         # Temporal-literal ratchet (after Unit 0)
npm run dev                               # ~116ms; then ?ast=/fixtures/<name>.json
```

Fixture regeneration (`twf` is on `PATH`, run from repo root). **A fixture is a
composite envelope; no single `twf` command produces it** — see `VERIFICATION.md`
§3.1.1 Fixtures for the exact script. The three halves:

```
twf parse <file...>                 # -> {summary, diagnostics, definitions}  = the `ast` half
twf graph --json <file...>          # -> {summary, diagnostics, graph}        = `.graph` is `parserGraph`
twf graph chunks --json <file...>   # -> {summary, diagnostics, chunks}       = `.chunks` is `decomposition`
```

All three accept **multiple files** (verified: two topic files give 74 nodes /
103 edges / 13 coarsened), which is how the multi-file fixture the `sourceFile`
dimension needs gets built. `twf parse` has no `--json` flag — it is always JSON.
Only `twf parse` carries `sourceFile`; `twf graph`'s nodes do not have the field
at all.

Do not reach for `make build` during iteration — it builds the Go binary too and
is far slower than the two commands above.

---

## 4.4 Access & boundaries

**May write:**

- `tools/visualizer/**`
- the new sibling package directory once created
- `Makefile` (build/pack/clean targets)
- `.github/workflows/ci.yml`
- `internal/harness/components.md`
- `.claude/skills/dev-cycle/references/review-quality-visualizer-spec.md` (T28 fix only)

**May read, must not modify:**

- `tools/lsp/**`, `tools/spec/**`, `tools/sampler/**`, `tools/wire-types/**`
- `skills/**`, `examples/**` (read as fixture sources only)

**Out of bounds even though reachable:**

- The distribution repo `jmbarzee/temporal-architect-dist`
- Anything outside the worktree root (see C6)
- `git stash` (see C6)
- Release tags, `make release*`
