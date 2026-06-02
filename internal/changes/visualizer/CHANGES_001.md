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

## Follow-ups (not in this change)

- **Nexus grouping**: treat the nexus ladder as an explicit optional dimension/group in the controls (e.g. collapsible) rather than tokens that merely render in nexus colours.
- **Gravity / Dynamics tabs**: not yet revisited under the new principles.
