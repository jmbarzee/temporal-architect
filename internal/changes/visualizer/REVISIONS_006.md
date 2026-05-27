# Visualizer: Central Node-Type Registry

The visualizer's per-node-type metadata — style, size, charge, Y band, summary
kind, AST def-type mapping, label, icon, CSS variable name — lives in roughly
**eight files with fifteen-plus insertion points**, all keyed on the same
`NodeType` union. Every new node type (the `nexusEndpoint` addition in
visualizer/CHANGES_002 was the most recent walkthrough) costs an update to each
of them, and the type system catches only the union additions — silently
missing CSS rules, slider rows, or summary cases ship at runtime.

This revision moves all of that into a single `NODE_TYPE_REGISTRY` of type
`Record<NodeType, NodeTypeDefinition>`, then rewires every existing consumer
to read from it. Adding a new node type becomes one new entry in one file.

## Problem Statement

The audit done while consuming `twf graph` (visualizer/REVISIONS_003) catalogued
every spot a `NodeType` switch lives:

| File | Per-node-type code |
|---|---|
| `tools/visualizer/src/graph/model.ts` | `NodeType` union; `nodeLevel()` switch |
| `tools/visualizer/src/graph/simulation.ts` | `chargeForType()` switch; `bandForType()` switch; `ALL_NODE_TYPES` array; `ForceParams` (charge + band field pairs); `DEFAULT_PARAMS` literal (charge + band defaults) |
| `tools/visualizer/src/components/GraphControlPanel.tsx` | `PUSH_CHARGE_SLIDERS` entries; `GRAVITY_BAND_SLIDERS` entries |
| `tools/visualizer/src/components/GraphCanvas.tsx` | `NODE_STYLES` record; `NODE_SIZES` record (currently keyed by `level`, which is itself derived from `nodeType`); `edgeStyleFor` fallback cases |
| `tools/visualizer/src/components/GraphView.tsx` | `nodeTypeToDefType()` and `defTypeToNodeType()` switches; `computeGraphNodeSummary` switch |
| `tools/visualizer/src/theme/temporal-theme.tsx` | `PrimitiveKind` union; `THEME` record; `DEF_TYPE_CONFIGS` array |
| `tools/visualizer/src/styles/index.css` | `--color-<type>` and `--color-<type>-border` for light AND dark themes; `.graph-control-typed-<type>` rules; `.dual-range-<type>` background; `.dual-range-<type>` thumb borders (webkit + moz); `.header-type-<type>Def` chip styles (light + dark) |

Adding `nexusEndpoint` last cycle required edits in every one of these. None
of them were typechecked against the others — the CSS in particular was
silent-on-omission. The wiring works today only because the most recent
contributor walked every spot deliberately; the next contributor will not.

A secondary symptom is the `level` field on `GraphNode` (currently `1 | 1.5 |
2 | 3 | 4`). The audit revealed that `level` is consumed in exactly three
places semantically (sizing, summary kind, a mostly-dead edge-color cascade)
and could just be a derived view over `nodeType`. The decimal `1.5` value
exists only because we needed a fifth tier without renumbering — a cost the
registry refactor naturally absorbs.

## Goals

1. **One source of truth.** Per-node-type metadata lives in
   `tools/visualizer/src/graph/node-types.ts` (or similar), exported as a
   typed `NODE_TYPE_REGISTRY` constant. Every consumer reads from it.
2. **Adding a node type is one edit.** Add an entry to the registry; the
   types, defaults, slider rows, CSS variables, filter chips, and theme
   entries all follow automatically.
3. **Drop `level` as a stored field on `GraphNode` and `GraphEdge`.** Sizing
   reads from the registry; summary switches on `summaryKindFor(nodeType)`;
   the edge-color cascade becomes explicit node-type checks for the
   coarsened cases.
4. **Y-band defaults align peer rungs across the parallel ladders.**
   Workflow and Operation share a Y band; Worker and Service share a Y band
   (already true); Namespace and Endpoint share a Y band (currently
   Endpoint sits below — this revision aligns them).

## Proposed Shape

```ts
// tools/visualizer/src/graph/node-types.ts
export interface NodeTypeDefinition {
  // Identity
  label: string                  // "Nexus Endpoint"
  icon: string                   // "⌖" — single glyph or icon component reference
  defType: string                // "nexusEndpointDef" — AST def-type used by tree view
  ladder: 'main' | 'nexus'
  tier: 'container' | 'host' | 'orchestrator' | 'leaf'
  defaultVisible: boolean

  // Visual
  color: {
    fill: string                 // "#9F1239"
    border: string               // "#4C0519"
    fillDark?: string            // optional dark-theme override
    borderDark?: string
    cssVarSuffix: string         // "nexus-endpoint" → --color-nexus-endpoint
  }
  size: {
    r: number                    // 15
    iconSize: number             // 14
  }

  // Physics
  physics: {
    charge: number               // -180
    yBand: { min: number; max: number }   // { min: -180, max: -60 }
  }

  // Summary
  summaryKind: 'containerCount' | 'hostRegistrations' | 'degree' | 'none'
}

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeDefinition> = {
  namespace:      { ... },
  nexusEndpoint:  { ... },
  worker:         { ... },
  nexusService:   { ... },
  workflow:       { ... },
  nexusOperation: { ... },
  activity:       { ... },
}

// Derived enumeration helpers exported from the same module:
export const ALL_NODE_TYPES: NodeType[]
export function definitionFor(t: NodeType): NodeTypeDefinition
```

CSS is generated at runtime from the registry. The visualizer's root layout
mounts a `<style>` block that emits `--color-<cssVarSuffix>: <fill>` for each
entry. The `.graph-control-typed-*` and `.dual-range-*` rules are similarly
emitted (or live as a single template that consumes `var(--color-<suffix>)`).
The hand-maintained color CSS variables in `index.css` go away.

## Scope

### Group 1: Define the registry

**New file:** `tools/visualizer/src/graph/node-types.ts`

Define `NodeTypeDefinition` and `NODE_TYPE_REGISTRY` with one entry per
existing `NodeType`. Copy current values from their scattered homes:
- `simulation.ts` → `physics.charge`, `physics.yBand`
- `GraphCanvas.tsx` `NODE_STYLES` / `NODE_SIZES` → `color`, `size`
- `theme/temporal-theme.tsx` → `label`, `icon`, `defType` (via DEF_TYPE_CONFIGS)
- `styles/index.css` → `color.fill`, `color.border`, `color.cssVarSuffix`
- New fields the audit motivated: `ladder`, `tier`, `summaryKind`, `defaultVisible`

Export `ALL_NODE_TYPES` and `definitionFor(t)`. Deprecate / remove the parallel
maps as their consumers migrate.

### Group 2: Migrate physics

**Files:** `tools/visualizer/src/graph/simulation.ts`,
`tools/visualizer/src/components/GraphControlPanel.tsx`

- Rewrite `chargeForType()` / `bandForType()` to read from the registry. The
  switches go away.
- `ForceParams` keeps per-type charge + band fields (the user tunes them at
  runtime), but the `DEFAULT_PARAMS` literal is generated from the registry:
  `Object.fromEntries(ALL_NODE_TYPES.map(t => ['charge' + cap(t), registry[t].physics.charge]))`.
- `PUSH_CHARGE_SLIDERS` and `GRAVITY_BAND_SLIDERS` in `GraphControlPanel.tsx`
  enumerate from the registry. Slider labels can use `tier`/`ladder` to
  generate `L1 NS`-style prefixes uniformly.

### Group 3: Migrate visual

**Files:** `tools/visualizer/src/components/GraphCanvas.tsx`,
`tools/visualizer/src/graph/model.ts`,
`tools/visualizer/src/components/GraphView.tsx`

- `NODE_STYLES` and `NODE_SIZES` go away. Replace lookups with
  `definitionFor(node.nodeType).color` and `.size`.
- `edgeStyleFor()` keeps its node-type checks but loses the `minLevel`
  fallback. The two coarsened cases (`namespace↔namespace`,
  `worker↔worker`) become explicit node-type checks. The `dependencyL3` /
  `dependencyL4` constants get renamed to describe what they paint (or
  fold into a single `dependencyDefault`).
- **Drop `level` and `NodeLevel` from `model.ts`.** Drop `sourceLevel` /
  `targetLevel` from `GraphEdge`. `build.ts` stops assigning them. The
  edge graduation in `GraphView.tsx` stops propagating them.
- `computeGraphNodeSummary` switches on
  `definitionFor(node.nodeType).summaryKind` instead of `node.level`.

### Group 4: Migrate theme + filter

**Files:** `tools/visualizer/src/theme/temporal-theme.tsx`,
`tools/visualizer/src/components/GraphView.tsx`

- `DEF_TYPE_CONFIGS` is generated from the registry: each entry projects
  `{ type: registry[t].defType, icon: registry[t].icon, label: registry[t].label,
  defaultOn: registry[t].defaultVisible }`.
- `nodeTypeToDefType()` and `defTypeToNodeType()` become two-way lookups
  derived from the registry (built once at module load).
- `THEME` keeps its broader `PrimitiveKind` surface (statements, awaits,
  closes, etc.) but the node-type subset of it is generated from the
  registry. Avoids drift between `THEME.workflow` and the canvas's workflow
  style.

### Group 5: Migrate CSS

**File:** `tools/visualizer/src/styles/index.css` (and possibly a new
`src/graph/node-types.css.ts` for the runtime-emitted block)

Two options. Pick one in the planning step:

**Option A (preferred): runtime-emitted style block.** At app mount, emit a
single `<style>` element containing `:root { --color-<suffix>: <fill>;
--color-<suffix>-border: <border>; ... }` per entry, plus the `.dual-range-*`
fill / thumb-border rules. The hand-maintained CSS variables in
`index.css` shrink to only the non-node-type styles. Pro: zero drift, zero
hand-edit on a new node type. Con: requires a small runtime hook in
`App.tsx` / `webview.tsx`.

**Option B: build-time CSS generator.** Add a `vite-plugin` (or a
pre-build script) that reads the registry and emits a static CSS file
imported by `index.css`. Pro: no runtime overhead, devtools see static
sources. Con: more build infrastructure.

Either way, the existing `.graph-control-typed-<type>`,
`.dual-range-<type>`, and `.header-type-<type>Def` rules in `index.css`
get deleted in favour of the generated equivalents.

### Group 6: Y-band defaults align peer rungs

**File:** `tools/visualizer/src/graph/node-types.ts` (registry entries)

Update the default `yBand` per node type so peer rungs share bands:

- **Namespace** and **NexusEndpoint** share the container band
  (current: `-340..-120` and `-180..-60` — adjust to overlap meaningfully
  or sit side-by-side at the same Y).
- **Worker** and **NexusService** share the host band (current: nearly
  identical at `-200..120` / `-200..110` — keep aligned).
- **Workflow** and **NexusOperation** share the orchestrator band
  (current: `100..460` and `10..340` — bring into alignment).
- **Activity** stays in its own leaf band.

This encodes the parallel-ladder model into the physical layout. Cross-ladder
dispatch edges (Workflow↔Operation, Operation→Workflow) become approximately
horizontal hops on the canvas, which is what the model says they should be.

## Files Touched

| File | Change |
|---|---|
| `tools/visualizer/src/graph/node-types.ts` (new) | `NodeTypeDefinition` interface; `NODE_TYPE_REGISTRY` constant; `definitionFor()` accessor; derived helpers |
| `tools/visualizer/src/graph/model.ts` | Drop `NodeLevel` and `level` field; drop `nodeLevel()`; drop `sourceLevel` / `targetLevel` from `GraphEdge` |
| `tools/visualizer/src/graph/simulation.ts` | `chargeForType()` / `bandForType()` read from registry; `DEFAULT_PARAMS` generated; `ALL_NODE_TYPES` re-exported from registry |
| `tools/visualizer/src/graph/build.ts` | Stop assigning `level` to view nodes / edges |
| `tools/visualizer/src/components/GraphCanvas.tsx` | Drop `NODE_STYLES` / `NODE_SIZES`; consume from registry; rewrite `edgeStyleFor()` to drop level cascade |
| `tools/visualizer/src/components/GraphControlPanel.tsx` | `PUSH_CHARGE_SLIDERS` / `GRAVITY_BAND_SLIDERS` enumerate from registry |
| `tools/visualizer/src/components/GraphView.tsx` | `nodeTypeToDefType` / `defTypeToNodeType` from registry; `computeGraphNodeSummary` switches on `summaryKind` |
| `tools/visualizer/src/theme/temporal-theme.tsx` | `DEF_TYPE_CONFIGS` generated from registry; `THEME` node-type entries derived |
| `tools/visualizer/src/styles/index.css` | Delete hand-maintained per-type rules; keep only structural / non-node-type styles |
| `tools/visualizer/src/{App,webview}.tsx` | Mount runtime style block (Option A) or import generated CSS (Option B) |
| `tools/visualizer/spec/GRAPH_VIEW.md` | Remove the "current `level` field is transient implementation detail" caveat now that it's true; document the `ladder` / `tier` fields if they end up exposed |

## Open Questions

1. **CSS generation strategy (Option A vs B).** Decide before Group 5.
   Lean Option A (runtime block) — smaller change, no build plumbing, and
   the runtime cost is one template-literal interpolation at mount time.

2. **`tier` field exposure.** The registry's `tier` field
   (`'container' | 'host' | 'orchestrator' | 'leaf'`) is more semantically
   precise than the current numeric `level`. Should it surface on
   `GraphNode` (replacing `level` directly), or stay registry-private and
   accessed via `definitionFor(t).tier`? Lean registry-private: nodes carry
   only identity (`id`, `nodeType`, `definitionKey`), and every visual /
   physics decision goes through the registry.

3. **`ladder` field — what's it actually for in this revision?** It's
   tempting to add but currently only documents intent (it's not consumed
   for layout). Three options:
   - Add it as a docs-only field (future-proofs an X-axis
     separation feature without committing to it now).
   - Don't add it; introduce it when an X-axis feature is on the table.
   - Add it AND wire a small simulation feature: a per-ladder X-offset
     default that pulls nexus-ladder nodes a bit to the right. This makes
     the parallel-ladder framing visible in the default layout. Larger
     scope but high payoff for the mental model.

   Lean option 1 for this revision, option 3 as a follow-up.

4. **`PrimitiveKind` in `temporal-theme.tsx`.** That union currently spans
   node types AND statement kinds (signals, queries, timers, etc.). This
   revision touches only the node-type subset; statement kinds stay where
   they are. Should the statement-kind metadata eventually move to a
   parallel `STATEMENT_KIND_REGISTRY`? Out of scope here; flag as a
   follow-up if the pattern proves useful.

## Dependencies

- **Blocked by visualizer/CHANGES_002 landing.** This revision assumes the
  parser-graph consumption path is in place (it touches several of the
  same files).
- **Independent of parser / DSL changes.** Internal to the visualizer
  package; no schema, no AST, no JSON contract changes. The blast radius
  is `tools/visualizer/` and the optional runtime style hook in
  `packages/vscode/src/extension.ts` (only if Option A's style block needs
  the host to provide one — unlikely, the webview can self-mount).

## Outcome

- Adding a new node type is one entry in `NODE_TYPE_REGISTRY`. The build
  catches all incomplete additions because every consumer reads from a
  typed `Record<NodeType, NodeTypeDefinition>` whose entries must satisfy
  `NodeTypeDefinition`.
- `level` and `NodeLevel` are gone. `GraphNode` carries only identity;
  every visual decision threads through the registry.
- The two coarsened-edge color cases (`namespace↔namespace`,
  `worker↔worker`) become explicit node-type checks in `edgeStyleFor()`,
  retiring the silent-fallthrough `dependencyL3` / `dependencyL4` branches.
- CSS variables and per-type rules generate from the registry (Option A
  runtime block, or Option B build-time generator).
- Default Y bands align peer rungs across the parallel ladders, encoding
  the model spec describes.
- Followups stay clean: a future "operation calls activity" surface or a
  per-ladder X-axis offset adds the field to the registry and migrates
  one consumer at a time, instead of grepping eight files.
