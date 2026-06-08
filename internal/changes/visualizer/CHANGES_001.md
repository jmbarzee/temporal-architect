# Visualizer Changes: Force Control Panel Overhaul

**Source:** Interactive design session reworking the Graph view's "Forces" control panel against five design principles (isomorphic controls, `nodeType` as the identity axis, essential-vs-optional dimensions, commensurable units, immediate feedback). Done outside the formal dev-cycle; recorded here for downstream propagation.

## Summary

The "Forces" control panel was reorganized and its first force section (Pull) was rebuilt around a direct-manipulation 2D control. Spec updated in `tools/visualizer/spec/GRAPH_VIEW.md` (§ Control Panel, § Design Decisions). Physics model (`ForceParams`, `simulation.ts` force math) is unchanged — these are control-surface changes (Option B: global multipliers kept behind the scenes).

## Group 1: Tabs + shared live-reheat — COMPLETED

**Changes:**
- The four equation sections (PUSH / PULL / GRAVITY / DYNAMICS) became **tabs** — one visible at a time. All four are mounted in a single CSS grid cell (`.graph-control-sections` / `.graph-control-section-slot`) so the panel sizes to the tallest tab and never resizes on switch.
- Removed the decorative per-force section colours (`--color-section-*` and the `.graph-control-section-*` accents). Node-type colour is retained where it carries meaning.
- Added a **shared "keep the simulation warm while tuning" mechanism**: `Simulation.nudge(target)` (raises alpha without cooling a hotter sim) + `GraphView.handleForceAdjust`, routed through a single `emitParamChange` funnel in the panel so every control re-energises the layout on edit. This reverses the spec's former "parameter changes do not auto-reheat" decision.

**Files touched:** `tools/visualizer/src/components/GraphControlPanel.tsx`, `tools/visualizer/src/components/GraphView.tsx`, `tools/visualizer/src/graph/simulation.ts`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`

## Group 2: Pull 2D spring map + force curves — COMPLETED

**Changes:**
- Replaced the Pull tab's ~18-slider stack with a **2D spring map** (`tools/visualizer/src/components/SpringControls.tsx`): one draggable token per edge category, x = length, y = stiffness. Tokens are split-coloured by their two endpoint node types with a dashed (containment) / solid (dependency) outline. Dragging a token sets that category's `k` and `rest` together; ordering is emergent from value.
- Added a read-only **force-curve visualization** below the map plotting each spring's displacement response (`stiffness · sign(Δ)|Δ|^exp`); hovering a token brightens its curve and dims the rest. The global shape param `exp` is controlled here.
- Global multipliers presented as two "scale all" sliders (`stiffness ×` = `pullMultiplier`, `length ×` = `distanceMultiplier`). The displayed equation is simplified to a single per-edge value each (`stiffness`, `length`).

**Files touched:** `tools/visualizer/src/components/SpringControls.tsx` (new), `tools/visualizer/src/components/GraphControlPanel.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal` (no parser/JSON contract change).

## Group 3: Pull spring-map refinements + first-class nexus springs — COMPLETED

**Changes:**
- **New nexus spring categories** (model change, behaviour-preserving). Promoted nexus relationships from shared springs to first-class, independently tunable categories in `ForceParams` + `edgeCategory()`: `Ep↔NS` (`linkEndpointToNamespace`), `Ep↔Op` (`linkEndpointToOperation` — an endpoint fronts an operation, split out from the service's `Nx↔Op`), `Wf↔Op` (`linkWorkflowToOperation`, the nexus call), `Op↔Act` (`linkOperationToActivity`). Operation→operation calls are not modelled as a distinct relationship — they fold into `Wf↔Op`. Defaults equal the spring each previously folded into, so the baseline layout is unchanged. `edgeCategory()` now returns a `key` (the category's k-field) so callers can match an edge to its spring-map token.
- **Spring-map refinements:** axis ranges widened to length `[0, 1000]` and stiffness `[0, 2]`; global `stiffness`/`length` "scale all" sliders relocated onto the axes they scale; axis tick numbers dropped (origin `0, 0` only); force-curve graph cropped (low baseline), enlarged (1.5× taller), boxed, and its y-axis labelled `force`; equation simplified to `F = α × stiffness × Δ^exp / d`; subtitle removed; control-panel text bumped to 12px to match the toolbar.
- **Active-edge canvas highlight:** hovering/dragging a token highlights only that edge category on the canvas, drawn as a coloured border that preserves the edge's own colour (plumbed `activePullEdge` from `SpringControls` → `GraphControlPanel` → `GraphView` → `GraphCanvas`).

**Files touched:** `tools/visualizer/src/graph/simulation.ts`, `tools/visualizer/src/components/SpringControls.tsx`, `tools/visualizer/src/components/GraphControlPanel.tsx`, `tools/visualizer/src/components/GraphView.tsx`, `tools/visualizer/src/components/GraphCanvas.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal` (no parser/JSON contract change).

## Group 4: Pull tuning pass — COMPLETED

**Changes:**
- **Directional Wf/Op springs.** Split `Wf↔Op` into `Wf→Op` (workflow makes a nexus call) and `Op→Wf` (operation delegates to a backing workflow / sync-op call) — added `linkOperationToWorkflow`/`distOperationToWorkflow`; `edgeCategory()` now branches on direction for the workflow/operation pair (op→op folds into `Wf→Op`).
- **New default layout.** `DEFAULT_PARAMS` spring k/rest values reset to hand-placed spring-map positions (these are the visible token positions, on the `[0,1000]` length × `[0,2]` stiffness axes).
- **Control relocations.** Removed the panel's Play/Reheat/Reset buttons; **Reheat** now lives in the graph toolbar next to Fit/Play and is ~10× stronger (`reheat(10)`); **Show force fields** moved to the PUSH tab. The panel no longer takes `running`/`onToggleRunning`/`onReheat`.
- **Spring-map polish.** Origin label fixed (was clipping the leading `0`); axis sliders thinned to a 4px track (purple `--color-workflow` accent).

**Files touched:** `tools/visualizer/src/graph/simulation.ts`, `tools/visualizer/src/components/SpringControls.tsx`, `tools/visualizer/src/components/GraphControlPanel.tsx`, `tools/visualizer/src/components/GraphView.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`.

## Group 5: Spring-control layout refactor + typography — COMPLETED

**Changes:**
- **Maintainability refactor.** Both the spring map and the force-curve graph now have their plot fill the full SVG viewBox (`overflow: visible` lets edge tokens spill instead of clipping), with axis labels, the origin marker, and the global sliders placed in a CSS grid *around* the SVG. The sliders share the plot's grid row/column, so they align to the plot structurally — removing the brittle magic-percentage insets (and the width-relative `margin-top` bug that made the stiffness slider overrun the plot).
- **Typography pass.** Single source of truth: `.graph-control-panel-body` sets 12px / sans, and a normalization block pins all panel text to 12px; only numeric/equation text overrides to mono. Tab labels are now title-case (removed `text-transform: uppercase`). The equation is centered.
- **Origin fix.** `0, 0` is now a DOM element in the grid's bottom-left corner (no longer clipped or spilling under the plot).

**Files touched:** `tools/visualizer/src/components/SpringControls.tsx`, `tools/visualizer/src/styles/index.css`
**Change type:** `Internal`.

## Group 6: Push 2D charge map + shared map/curve primitives — COMPLETED

**Changes:**
- **Softening becomes a per-type core radius** (model change, behaviour-preserving). Removed the single global `chargeSoftening`; added a per-node-type `coreRadius<Type>` (7) plus a global `coreRadiusMultiplier` to `ForceParams`. The charge force now derives per-pair softening from the endpoints' radii: `rEff = coreRadiusMultiplier × coreRadius[type]`, `soft = ((rEffA + rEffB) / 2)²`. Every `coreRadius` defaults to `√450 ≈ 21.2` and the multiplier to `1`, so the per-pair softening stays `450` — today's layout is unchanged. Added `CORE_RADIUS_KEY` + `coreRadiusForType()` (mirroring `CHARGE_KEY`/`chargeForType`), with a `CORE_RADIUS_MIN = 2` floor so a type dragged to 0 can't reintroduce the close-range singularity.
- **Shared 2D-map/curve primitives.** Extracted `ForceMap2D` + `ForceCurves` (`tools/visualizer/src/components/ForceMap.tsx`) — purely presentational/interactive (grid layout, axis sliders, drag via `getScreenCTM`, hover linking; pre-computed polylines + optional baseline + per-item markers). A token with one colour renders a solid dot; two colours render a split dot. Refactored Pull's `SpringMap`/`SpringCurves` to thin wrappers over these.
- **Push wrappers** (`tools/visualizer/src/components/ChargeControls.tsx`): `ChargeMap` (one solid per-type token, y = charge magnitude `[0,1000]` stored negative, x = core radius `[0,100]`; globals `push` and `coreRadiusMultiplier` on the axes) and `ChargeCurves` (each type's falloff `charge / (d² + rEff²)^exp` vs distance, core radius marked, `chargeExponent` slider beneath). The PUSH tab replaces its master-slider + per-type-charge-slider stack with these.
- **Push equation** simplified to a centered fraction `F = charge / (d² + r²)^exp` (alpha and push dropped — push is the y "scale all").
- **Charge exponent acts on the squared distance directly** (no `/2`). The simulation, ring formula, and falloff curves all drop the `/2`; `chargeExponent` default moves `1.4 → 0.7` so behaviour is preserved (`exp = 1` is now inverse-square). The exp slider range narrows to `[0.5, 1.0]` (step `0.05`) — the band that holds the useful range, instead of being pinned to the left of a `[0.5, 3]` track.
- **Dropped "L1/L1.5" level prefixes** from `sliderLabelFor()` (charge-map tokens, gravity-band rows) and the help text — the level numbering carried no actionable meaning; abbreviations (`NS`, `Ep`, `Wk`, …) remain.
- **Force fields: dropped the toggle, de-opacified.** Removed `showForceFields` entirely (the checkbox, the `GraphView` state, the `GraphCanvas` prop). Charge rings are now hover-only, driven by `hoveredChargeType` linking the charge map ↔ curves ↔ canvas. Cut the per-node disc **fill** so overlapping fields no longer stack into a solid wash — only ring outlines remain. The ring radius formula now uses each node's own per-type effective core radius for softening.

**Files touched:** `tools/visualizer/src/graph/simulation.ts`, `tools/visualizer/src/components/ForceMap.tsx` (new), `tools/visualizer/src/components/ChargeControls.tsx` (new), `tools/visualizer/src/components/SpringControls.tsx`, `tools/visualizer/src/components/GraphControlPanel.tsx`, `tools/visualizer/src/components/GraphView.tsx`, `tools/visualizer/src/components/GraphCanvas.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal` (no parser/JSON contract change).

## Group 6: Force-computation refactor + ForceParams decomposition — COMPLETED

**Changes:**
- **Extracted `tools/visualizer/src/graph/forces.ts`** — all force math (the per-type/per-edge lookup records, `chargeForType`/`coreRadiusForType`/`bandForType`/`edgeCategory`, the `apply*` force functions, and a `toPolar`/`fromPolar` adapter). `simulation.ts` re-exports the helpers so consumers are unchanged. `tick()` is now four `apply*` calls + the integrate/cool tail. `forces.ts` imports only types from `simulation.ts` (no runtime cycle). Behaviour-preserving.
- **Decomposed `ForceParams`** into `ChargeParams & LinkParams & GravityParams & DynamicsParams` (still one flat object at runtime). Each `apply*` and helper takes only its category slice; the lookup records are keyed to their category's `keyof`. Compiler now prevents a force reading params outside its category.

**Files touched:** `tools/visualizer/src/graph/forces.ts` (new), `tools/visualizer/src/graph/simulation.ts`
**Change type:** `Internal`.

## Group 7: Gravity rework — Cartesian/Radial modes + Band/Topological/Center — COMPLETED

**Changes:**
- **Model.** Gravity is now three toggleable forces. **Band** gravity is mode-aware (Cartesian Y bands with median re-centering of the visible types so editing/toggling doesn't shift the graph; Radial maps tiers to rings, uppermost innermost, charge handling angular spread). **Topological** gravity (reshaped from the old downstream force) is a single-sided inward pull scaled by downstream-reach score (Cartesian focal = top, Radial focal = origin), leaves untouched. **Center** gravity (new `gravityCenter`) is a radial pull to the origin, dispatched only when neither toggle is on. `GravityParams` gains `gravityMode`, `bandEnabled`, `topologicalEnabled`, `gravityCenter`. (`simulation.ts`, `forces.ts`)
- **Panel.** New `GravityControls.tsx`: `Cartesian | Radial` mode switch, Band/Topological toggles, and a **band pseudo-plot** (per-type columns with two draggable dots over full-width stripes, labels above, Y/X strength sliders on the gutters, X band beneath). Topological shows a strength slider + note. Dropped the all-caps title, the "hierarchical anchor" framing, the per-type band slider stack; strength ranges extended (~5x); no numbers. (`GraphControlPanel.tsx`, `GravityControls.tsx`, `index.css`)
- **Plumbing.** `GraphView.handleGravityChange` updates params + reheats (mode/toggle changes relocate nodes). The canvas gravity overlay is mode-aware: median-centred Y stripes + X band (Cartesian) or concentric rings (Radial), gated on `bandEnabled`. (`GraphView.tsx`, `GraphCanvas.tsx`)
- Spec updated: GRAPH_VIEW.md § Gravity (rewritten from "hierarchical anchor"), Control Panel GRAVITY, force-field overlay, feedback loop.

**Files touched:** `tools/visualizer/src/graph/simulation.ts`, `tools/visualizer/src/graph/forces.ts`, `tools/visualizer/src/components/GravityControls.tsx` (new), `tools/visualizer/src/components/GraphControlPanel.tsx`, `tools/visualizer/src/components/GraphView.tsx`, `tools/visualizer/src/components/GraphCanvas.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`.

## Group 8: Gravity refinements — band mini-world-view + topological contrast — COMPLETED

**Changes:**
- **Band pseudo-plot reworked into a "mini world view"** (`GravityControls.tsx`, `index.css`): vertical = world Y, horizontal = world X. Rest regions render as translucent stripes *behind* and inert (`pointer-events: none`) — full-width horizontal per type, full-height vertical for the X band — so handles stay grabbable; they highlight/dim from hovering the matching control. Per-type controls are now vertical two-handle sliders spanning the plot; the X band is a horizontal two-handle slider immediately under the plot. The Y axis is labeled (the "x band" label removed).
- **Panel structure** (`GravityControls.tsx`): config tools are always shown (dimmed when their force is off); Band/Topological enable checkboxes sit above with dividers; the Cartesian/Radial toggle is centered with its own divider.
- **Topological contrast** (`simulation.ts`, `forces.ts`, `GravityControls.tsx`): added `gravityTopologicalExp` — the reach score is shaped as `score^exp` so high-reach roots dominate (linear felt non-functional). Exposed a contrast slider + a read-only reach→pull curve, and widened the strength range.

**Files touched:** `tools/visualizer/src/graph/simulation.ts`, `tools/visualizer/src/graph/forces.ts`, `tools/visualizer/src/components/GravityControls.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`.

## Group 9: Topological depth metric + bounded reheat — COMPLETED

**Changes:**
- **Topological score = downstream depth, not reach count** (`GraphView.computeDownstreamScores`): replaced the transitive-reach-count BFS (which was combinatorially heavy-tailed, forcing a `log(1+c)` compression) with downstream *depth* — BFS hops to the deepest reachable leaf along dependency edges. Depth is naturally tiered, so it's normalized **linearly** (`d / maxDepth`) with the log dropped entirely. This makes the contrast (`score^exp`) curve truthful and tracks "sits atop a deep call chain" better than "fans out to many leaves". Out-degree was considered as a secondary/blend signal but left out for now (too local/noisy for root-ness).
- **Reheat decoupled from settle duration** (`simulation.ts`, `GraphView.tsx`): `reheat(alpha)` now also sets a per-burst cooling rate `alpha / REHEAT_TICKS` (200), so the settle window is fixed regardless of kick size — a bigger kick moves the layout *further* without lingering *longer*. The old `reheat(10)` with constant `alphaDecay` decayed over ~2000 ticks ("goes on forever"); the toolbar Reheat now uses `reheat(2)`. `nudge()` clears the per-burst rate so live tuning cools at the normal `alphaDecay`. The burst rate auto-clears when the sim lands back at `alphaMin`.

**Files touched:** `tools/visualizer/src/graph/simulation.ts`, `tools/visualizer/src/components/GraphView.tsx`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`.

## Group 10: Gravity panel polish + topological containment propagation — COMPLETED

**Changes:**
- **Topological depth propagates up containment** (`GraphView.computeDownstreamScores`): after the per-node downstream-depth BFS, each node's depth is propagated up its `parentId` chain so a container (worker/service/namespace) is scored at least as deep as anything it hosts. Previously containers had no dep edges → score 0 → no pull, so a deep workflow got dragged *above* its own worker, inverting the tier order band gravity holds. Now the two gravities reinforce. Cheap walk (tens–hundreds of nodes) with a per-walk cycle guard and an early-out when an ancestor is already at least as deep.
- **Toggles relocated** (`GravityControls.tsx`, `index.css`): the Band/Topological enable checkboxes moved from a pooled row at the top into each section's header, next to the controls they govern. The header stays full opacity; only the tools dim when off.
- **Per-type equations** added under each force: Band `F = strength × d` (d = distance outside the rest band), Topological `F = strength × depthᵉˣᵖ × d` (d = distance to focal).
- **Band controls labelled** — both force sliders now read **strength** (vertical on the left gutter, horizontal on the bottom gutter); the X-range dual-range sits immediately under the plot, above the horizontal strength slider, continuing the in-plot X-band stripe.
- **Topological controls restructured** — the depth→pull curve now labels both axes (x = depth, y = pull); the **strength** and **exp** sliders moved beneath the curve; the old "contrast" slider renamed **exp** to match the Push/Pull exponent sliders; the prose description dropped (the equation + labelled curve carry it).

**Files touched:** `tools/visualizer/src/components/GraphView.tsx`, `tools/visualizer/src/components/GravityControls.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`.

## Group 11: Gravity sub-tabs + band exponent — COMPLETED

**Changes:**
- **Band/Topological split into sub-tabs** (`GravityControls.tsx`, `index.css`): the gravity tab was getting tall, so each force now lives in its own sub-tab; only the active body renders. Each sub-tab carries a sliding on/off **switch** (a styled checkbox) plus a selectable label — switch toggles the force, label selects the body, independently — so both forces' enabled state stays visible at all times. The old per-section header checkboxes and dividers are gone.
- **Cartesian/Radial shared across both sub-tabs**: the mode switch moved above the sub-tab bar so it stays visible regardless of which force is selected.
- **Band exponent** (`simulation.ts`, `forces.ts`, `GravityControls.tsx`): new `gravityBandExp` param (default 1). Band force is now `strength × d^exp` via a shared `bandForce(d, exp)` helper used by both the cartesian X/Y springs and the radial ring pull. Equation updated to `F = strength × dᵉˣᵖ` and an **exp** slider (0.5–3, matching the Pull tab) added beneath the plot.
- **Band strength sliders labelled X / Y** ("Y strength" on the left gutter, "X strength" on the bottom).
- **X-band dual-range gap closed**: reduced the plot's bottom padding, tightened the band-layout row gap, and shrank the dual-range track height so the X-band bar hugs the bottom of the plot instead of floating below it.
- `.gravity-topo-row` renamed `.gravity-slider-row` (now shared by band exp + topological strength/exp rows).

**Files touched:** `tools/visualizer/src/graph/simulation.ts`, `tools/visualizer/src/graph/forces.ts`, `tools/visualizer/src/components/GravityControls.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`.

## Group 12: Gravity sub-tab/mode restyle + band force curves — COMPLETED

**Changes:**
- **Sub-tabs restyled as underline tabs** (`index.css`): the Band/Topological sub-tabs now use the same underline-tab pattern as the main force tabs, distinguished as a sub-level by an accent-coloured underline (main tabs underline in the text colour) plus the inline on/off switch each carries. Replaced the bordered-pill look.
- **Mode switch** (`index.css`): kept as a centered segmented control (the correct pattern for an exclusive binary choice — deliberately *not* a sliding toggle, which would read as on/off and collide with the sub-tab switches). Added an inactive-hover state; its accent-filled active segment now rhymes with the accent underline (tabs) and accent fill (switches).
- **Band X/Y force curves** (`ForceMap.tsx`, `GravityControls.tsx`, `index.css`): added a read-only force-response curve to the Band sub-tab via the shared `ForceCurves` read-out (matching Pull/Push). Two curves (X, Y) plot `strength × dᵉˣᵖ` over distance, normalized to the stronger axis so the taller curve is the stiffer one; the band `exp` slider now lives beneath the curve (replacing the standalone exp row). `CurveItem` gained an optional end `label` (rendered at the curve's end point) so X/Y are distinguishable without a linked map token.

**Files touched:** `tools/visualizer/src/components/ForceMap.tsx`, `tools/visualizer/src/components/GravityControls.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`.

## Group 13: Gravity final tweaks — equal mode pills, non-resizing sub-tabs, tighter band sliders — COMPLETED

**Changes:**
- **Equal-width mode segments** (`index.css`): `.gravity-modes` switched from flex to `inline-grid` with two `1fr` tracks, so Cartesian/Radial take the width of the wider label and the divider is centred.
- **Sub-tabs no longer resize the panel** (`GravityControls.tsx`, `index.css`): both sub-tab bodies are now mounted and stacked in a single grid cell (`.gravity-bodies` / `.gravity-body`, active-only visible), mirroring the main-tab `.graph-control-sections` trick — switching Band↔Topological keeps the panel height fixed at the taller body.
- **Band X/Y strength capped** (`GravityControls.tsx`): the vertical/horizontal strength sliders dropped from max `1` to max `0.25` (step `0.005`), so the useful low range fills the track (defaults 0.145 / 0.05 now sit mid-range).

**Files touched:** `tools/visualizer/src/components/GravityControls.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`.

## Group 14: Control-panel UI primitives (WS1) — COMPLETED

**Changes:** Behavior-preserving extraction of three reusable primitives into `tools/visualizer/src/components/controls/`, so the control panel's sliders, equations, and plot scaffolding stop being re-implemented per tab.
- **`Slider`** (`controls/Slider.tsx`, `.ctl-slider`/`-h`/`-v`) — the one uniform range input (horizontal rows/exp/x-gutter, vertical y-gutter). Replaced the scattered `.spring-axis-slider*`, `.spring-exp-slider`, `.graph-control-slider-input` classes. Carries a `popId` hook for the upcoming formula-hover "pop".
- **`Equation`** (`controls/Equation.tsx`) — the governing-formula block (string → `<pre>`, node → inline; renders nothing when empty). Adopted by `GraphControlPanel`'s `EquationSection` and the two `GravityControls` formulas.
- **`Plot`** (`controls/Plot.tsx`, `.ctl-plot*`) — the layout shell shared by the node plot and band plot: y-axis label + vertical slider on the left gutter, the caller's `<svg>`, and a bottom stack (x slider, x label, band X-range). `ForceMap2D` and `GravityBandPlot` now render through it; the caller keeps its own svg ref + content. Removed the duplicate `.spring-map` and `.gravity-band-layout` grids and the `.gravity-band-strength-*` labels.
- `ForceCurves` (the Graph) keeps its layout but its exp control is now a `Slider`. Spacing normalized to one set of gaps across maps (row-gap 2, margin-top 10); the band X-range still hugs the plot.

**Files touched:** `tools/visualizer/src/components/controls/{Slider,Equation,Plot}.tsx` (new), `tools/visualizer/src/components/ForceMap.tsx`, `tools/visualizer/src/components/GravityControls.tsx`, `tools/visualizer/src/components/GraphControlPanel.tsx`, `tools/visualizer/src/styles/index.css`
**Change type:** `Internal`. Tracked in `control-panel-overhaul.md` (WS1).

## Group 15: Control-panel usability tweaks (WS2) — COMPLETED

**Changes:**
- **Removed the help `?`** button, its popover, the `HELP_TEXT` blob, and the `helpOpen` state + CSS (`GraphControlPanel.tsx`, `index.css`).
- **Equation card** — `.graph-control-equation-formula` now renders as an unassuming tinted/bordered card (dropped the 0.7 opacity), so the governing equation reads as a distinct band above the controls.
- **Formula-hover → slider pop** — new `controls/PopContext.tsx` (`PopProvider`, `usePop`, `FormulaValue`). Hovering a value token in an equation pops the matching **global** slider with an accent halo. `Slider` reads the context and adds `.ctl-slider-popped`; `GlobalSlider` gained a `popId`, threaded through `ForceMap2D`/`ForceCurves` and set in Charge/Spring/Gravity controls (pushMultiplier, coreRadiusMultiplier, chargeExponent, pullMultiplier, distanceMultiplier, linkExponent, bandStrength, bandExp, topoStrength, topoExp). Push/Pull/Gravity formula tokens wrapped in `FormulaValue`.
- **Adaptive curve gridlines** — `ForceCurves` takes an optional `xMax` (data-domain) and draws light value-anchored vertical gridlines at a `niceStep(max, 6)` interval; Spring/Charge curves pass their dynamic `dMax` so the lines re-space as the scale changes (band curve passes `1`).

**Files touched:** `tools/visualizer/src/components/controls/{PopContext.tsx (new),Slider.tsx}`, `tools/visualizer/src/components/{ForceMap,ChargeControls,SpringControls,GravityControls,GraphControlPanel}.tsx`, `tools/visualizer/src/styles/index.css`, `tools/visualizer/spec/GRAPH_VIEW.md`
**Change type:** `Internal`. Tracked in `control-panel-overhaul.md` (WS2).

## Group 16: Edge-type registry + schema-derived collections (WS3 A+C) — COMPLETED

**Changes:** Behavior-preserving — the edge taxonomy now has a single source of truth, and the gravity band columns derive from the node registry.
- **`graph/edge-types.ts` (new)** — `EDGE_TYPE_REGISTRY` / `ALL_EDGE_TYPES` (one entry per category: id == stiffness key, endpoints, category, directional flag, ForceParams link/dist keys, default physics, tooltip) + `edgeTypeFor(edge)` which ports `forces.edgeCategory`'s exact prioritized rule order. Imports only types from `simulation` (no runtime cycle).
- **`forces.edgeCategory`** collapsed from a ~70-line if/else to a 4-line read: `edgeTypeFor(edge)` resolves the category, then it reads the live param values. (`forces.ts`)
- **`PULL_EDGES`** now derived from `ALL_EDGE_TYPES` (was a hand-maintained duplicate of the same taxonomy). (`SpringControls.tsx`)
- **`DEFAULT_PARAMS`** link/dist values now sourced from `EDGE_TYPE_REGISTRY[...].physics` (was 28 inline magic numbers divorced from the pair definitions). (`simulation.ts`)
- **Band-plot columns** — `node-types.ts` gained `MAIN_LADDER` / `NEXUS_LADDER` (tier-ordered per family); `GravityControls` derives `COL_ORDER` / `MAIN_COUNT` from them and drops the duplicated `ABBREV` in favour of `sliderLabelFor`. (`node-types.ts`, `GravityControls.tsx`)

**Deferred:** WS3-B (replace flat per-type/per-edge `ForceParams` fields with id-keyed maps) — the largest ripple; A+C already remove the duplication. Tracked in `control-panel-overhaul.md`.

**Files touched:** `tools/visualizer/src/graph/edge-types.ts` (new), `tools/visualizer/src/graph/{forces,simulation,node-types}.ts`, `tools/visualizer/src/components/{SpringControls,GravityControls}.tsx`
**Change type:** `Internal`. Tracked in `control-panel-overhaul.md` (WS3 A+C).

## Group 17: id-keyed param maps (WS3 B) — COMPLETED

**Changes:** Behavior-preserving — flat per-type/per-edge `ForceParams` fields replaced with id-keyed maps, killing the last of the stringly-typed addressing. Done in four committed sub-steps.
- **B0 — patch contract.** `onParamChange` (and `emitParamChange`, control props, `GraphView.handleParamChange`) switched from `(key, value)` to `(patch: Partial<ForceParams>)`, matching the existing `handleGravityChange`. Enables nested-map writes and unifies the edit paths.
- **B1 — charge/coreRadius.** `ChargeParams` now `charge: Record<NodeType, number>` + `coreRadius: Record<NodeType, number>`; `DEFAULT_PARAMS` builds them from `NODE_TYPE_REGISTRY`; deleted `CHARGE_KEY`/`CORE_RADIUS_KEY`; `chargeForType`/`coreRadiusForType` and `ChargeControls` read/write the maps.
- **B2 — bands.** `GravityParams` now `band: Record<NodeType, {min,max}>`; deleted `BAND_MIN_KEY`/`BAND_MAX_KEY` (+ re-exports); `bandForType` and `GravityControls` band plot read/write the map.
- **B3 — link/dist.** `LinkParams` now `link`/`dist: Record<EdgeTypeId, number>`; `EdgeTypeDefinition` dropped `linkKey`/`distKey` (the `id` is the key); `edgeCategory` reads `params.link[def.id]`/`params.dist[def.id]` and its `key` is now the `EdgeTypeId`; `SpringControls` `PullEdgeDef` uses `id` and read/writes the maps; canvas active-edge highlight matches on the id unchanged.

Net: per-type/per-edge params are now `Record<id, …>` keyed by `NodeType`/`EdgeTypeId`, so a mis-addressed control is a compile error, and the param shape is config-injection/persistence-friendly. Defaults still source from the registries (identical values).

**Files touched:** `tools/visualizer/src/graph/{simulation,forces,edge-types}.ts`, `tools/visualizer/src/components/{GraphView,GraphControlPanel,ChargeControls,SpringControls,GravityControls}.tsx`
**Change type:** `Internal`. Tracked in `control-panel-overhaul.md` (WS3-B).

## Group 18: GraphView decomposition into hooks — COMPLETED

**Changes:** Behavior-preserving decomposition of the 1544-line `GraphView` god-component into six focused hooks under `tools/visualizer/src/components/graph-view/`, plus a shared `nodeDefType` mapper. GraphView is now an ~850-line orchestrator. Done one hook per step, each `tsc` + `build:webview` clean and visually spot-checked in the extension debugger.
- **`useGraphModel`** — pure data from props: `graph` build, `allFiles`, filter-change `recentlyChanged` flash, error/diagnostic partition.
- **`useViewport`** — viewport transform, `containerRef`, the `initialFitDone`/`pendingCenterRef` coordination refs, and `fit()`.
- **`useHighlight`** — hover/select/keyboard-focus/shift + control-panel `active*` preview, the transitive-dep highlight sets, `focusedNodeId`, and the selection-reset-on-graph-change (moved out of the sim rebuild effect).
- **`useSimulation`** — the spine: `simRef`, `simVersion`, `running`, `forceParams`, `getNode`, and every sim-mutating handler (param/gravity/adjust, node drag, reheat, play/pause). Rebuild effect calls an `onRebuild` callback (held in a ref) to reset the camera/fps coordination.
- **`useVisibleGraph`** — the visible-subgraph derivation (type/file filter + edge graduation + summaries + downstream-depth scores), keyed on `simVersion` (the explicit data link to the sim) + filter.
- **`useSimulationLoop`** — the RAF physics loop (tick + one-shot initial fit + cross-view center + fps + stability stop), the hover tooltip tick, and the seed-on-type-change / reheat-on-file-change effects; consumes the sim + visible subgraph + camera/selection handles.

Key design points: the sim/data/loop cycle is resolved by separating the sim *instance* (`useSimulation`) from its *driver* (`useSimulationLoop`); cross-hook dependencies are explicit (returned values passed as args + dep-array entries, plus the `simVersion` signal); the mutation-driven 60fps render contract is preserved (canvas reads live `node.x/.y`; React re-renders only on coarse signals).

**Files touched:** `tools/visualizer/src/components/graph-view/{useGraphModel,useViewport,useHighlight,useSimulation,useVisibleGraph,useSimulationLoop,nodeDefType}.ts` (new), `tools/visualizer/src/components/GraphView.tsx`
**Change type:** `Internal`.

## Group 19: Topological gravity — containers strictly out-rank their contents — COMPLETED

**Change:** `computeDownstreamScores` ([useVisibleGraph.ts](tools/visualizer/src/components/graph-view/useVisibleGraph.ts)) now adds **one rank per containment tier** as it propagates depth up the `parentId` chain (was: set ancestor to the *max* descendant depth, leaving a namespace *equal* to its deepest workflow). Scores are then normalized by the post-propagation max (the top container). Because topological gravity is a distance-proportional spring toward the focal point, equal scores previously let a deep workflow overshoot *above* its namespace under a strong strength setting; strictly-greater container scores keep the tier order intact under topological gravity without relying on band gravity to break the tie.

**Files touched:** `tools/visualizer/src/components/graph-view/useVisibleGraph.ts`
**Change type:** `Internal`.

## Follow-ups (not in this change)

- **Nexus grouping**: treat the nexus ladder as an explicit optional dimension/group in the controls (e.g. collapsible) rather than tokens that merely render in nexus colours.
- **Gravity / Dynamics tabs**: not yet revisited under the new principles.
