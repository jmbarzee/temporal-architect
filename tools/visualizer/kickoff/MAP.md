# Structural map — generated, do not edit

`npm run map` regenerates this; `npm run map -- --check` fails if it is stale.
It is not a gate. It exists because "who imports this" and "which zone is
this in" were being answered by grep, repeatedly, and wrongly.

**zone** — `manifest` is the library, `tools/graph-view/src/` (the three ratchets
measure it); `shim` is the host's domain half; `neither` is measured by nothing,
which is worth noticing rather than assuming.

| file | zone | leak | imported by |
|---|---|---:|---|
| `App.tsx` | neither | 5 | `main.tsx` |
| `adapter/build.ts` | shim | 56 | **6** files |
| `adapter/edge-types.ts` | shim | 176 | **6** files |
| `adapter/groups.ts` | shim | 2 | `components/GroupsModal.tsx`, `components/WorkflowCanvas.tsx`, `verify/seam-probes.ts` |
| `adapter/node-type-styles.ts` | shim | 2 | `App.tsx`, `lib.ts`, `verify/static-golden.ts` |
| `adapter/node-types.ts` | shim | 149 | **18** files |
| `adapter/storage.ts` | shim |  | `components/WorkflowCanvas.tsx` |
| `adapter/useGraphModel.ts` | shim | 6 | `components/TreeView.tsx`, `components/WorkflowCanvas.tsx`, `verify/seam-probes.ts` |
| `components/ErrorBars.tsx` | neither |  | `components/TreeView.tsx`, `components/WorkflowCanvas.tsx` |
| `components/GroupsModal.tsx` | neither | 8 | `components/WorkflowCanvas.tsx` |
| `components/StyleGuide.tsx` | neither | 62 | `components/VisualizerHost.tsx`, `lib.ts` |
| `components/TreeView.tsx` | neither | 56 | `components/WorkflowCanvas.tsx` |
| `components/VisualizerHost.tsx` | neither | 8 | `App.tsx`, `lib.ts` |
| `components/WorkflowCanvas.tsx` | neither | 69 | **8** files |
| `components/blocks/AwaitBlocks.tsx` | shim | 92 | `components/blocks/StatementBlock.tsx` |
| `components/blocks/CallBlocks.tsx` | shim | 60 | `components/blocks/StatementBlock.tsx` |
| `components/blocks/ContextualNav.tsx` | shim | 24 | `components/blocks/CallBlocks.tsx`, `components/blocks/DefinitionBlock.tsx`, `components/blocks/LeafBlocks.tsx` |
| `components/blocks/ControlFlowBlocks.tsx` | shim |  | `components/blocks/StatementBlock.tsx` |
| `components/blocks/DefinitionBlock.tsx` | shim | 192 | `components/TreeView.tsx` |
| `components/blocks/LeafBlocks.tsx` | shim | 21 | `components/blocks/StatementBlock.tsx` |
| `components/blocks/OptionsSection.tsx` | shim | 2 | `components/blocks/CallBlocks.tsx`, `components/blocks/DefinitionBlock.tsx`, `components/blocks/WorkflowContent.tsx` |
| `components/blocks/StatementBlock.tsx` | shim | 12 | **5** files |
| `components/blocks/WorkflowContent.tsx` | shim | 19 | `components/blocks/AwaitBlocks.tsx`, `components/blocks/CallBlocks.tsx`, `components/blocks/DefinitionBlock.tsx` |
| `components/blocks/useToggle.ts` | shim |  | **6** files |
| `components/protocol.ts` | neither | 3 | **5** files |
| `lib.ts` | neither | 24 | — |
| `main.tsx` | neither |  | — |
| `theme/GearIcons.tsx` | shim | 3 | `theme/temporal-theme.tsx` |
| `theme/temporal-theme.tsx` | shim | 51 | **7** files |
| `types/ast.ts` | shim | 26 | **17** files |
| `types/decomposition.ts` | shim | 3 | **7** files |
| `types/parser-graph.ts` | shim | 3 | **7** files |
| `types/payload.ts` | neither | 12 | `components/VisualizerHost.tsx`, `lib.ts`, `verify/fixtures.ts` |
| `verify/filter-states.ts` | neither | 13 | `verify/tier-a.ts` |
| `verify/fixtures.ts` | neither | 10 | **6** files |
| `verify/force-probes.ts` | neither | 28 | `verify/static-golden.ts` |
| `verify/host-probes.ts` | neither | 2 | `verify/static-golden.ts` |
| `verify/main.ts` | neither |  | — |
| `verify/ontology-probes.ts` | neither | 88 | `verify/static-golden.ts` |
| `verify/rng.ts` | neither | 1 | **4** files |
| `verify/scalar-probes.ts` | neither | 12 | `verify/static-golden.ts` |
| `verify/scheme-probes.ts` | neither | 19 | `verify/static-golden.ts` |
| `verify/seam-probes.ts` | neither | 8 | `verify/static-golden.ts` |
| `verify/snapshot.ts` | neither |  | **14** files |
| `verify/static-golden.ts` | neither | 25 | `verify/main.ts` |
| `verify/synthetic-visible.ts` | neither | 33 | `verify/static-golden.ts` |
| `verify/tier-a.ts` | neither | 15 | **5** files |
| `verify/tier-b.ts` | neither | 7 | `verify/main.ts` |
| `verify/tier-c.ts` | neither | 17 | `verify/main.ts` |
| `verify/tuning-probes.ts` | neither | 76 | `verify/static-golden.ts` |
| `verify/view-probes.ts` | neither | 13 | `verify/static-golden.ts` |
| `../graph-view/components/AxisControls.tsx` | manifest |  | `../graph-view/components/GravityControls.tsx` |
| `../graph-view/components/CanvasErrorBoundary.tsx` | manifest |  | `../graph-view/components/GraphView.tsx` |
| `../graph-view/components/ChargeControls.tsx` | manifest |  | `../graph-view/components/PushPullControls.tsx` |
| `../graph-view/components/FilterBar.tsx` | manifest |  | `verify/seam-probes.ts`, `../graph-view/components/GraphView.tsx`, `../graph-view/index.ts` |
| `../graph-view/components/ForceMap.tsx` | manifest |  | `../graph-view/components/AxisControls.tsx`, `../graph-view/components/ChargeControls.tsx`, `../graph-view/components/SpringControls.tsx` |
| `../graph-view/components/GraphCanvas.tsx` | manifest |  | `../graph-view/components/GraphView.tsx` |
| `../graph-view/components/GraphControlPanel.tsx` | manifest |  | **5** files |
| `../graph-view/components/GraphView.tsx` | manifest |  | `../graph-view/index.ts` |
| `../graph-view/components/GravityControls.tsx` | manifest |  | **4** files |
| `../graph-view/components/PinToggle.tsx` | manifest |  | `../graph-view/components/FilterBar.tsx` |
| `../graph-view/components/PushPullControls.tsx` | manifest |  | `verify/view-probes.ts`, `../graph-view/components/GraphControlPanel.tsx` |
| `../graph-view/components/SpringControls.tsx` | manifest |  | `../graph-view/components/PushPullControls.tsx` |
| `../graph-view/components/controls/Equation.tsx` | manifest |  | `../graph-view/components/AxisControls.tsx`, `../graph-view/components/GravityControls.tsx`, `../graph-view/components/controls/EquationSection.tsx` |
| `../graph-view/components/controls/EquationSection.tsx` | manifest |  | `../graph-view/components/GraphControlPanel.tsx`, `../graph-view/components/PushPullControls.tsx` |
| `../graph-view/components/controls/Plot.tsx` | manifest |  | `../graph-view/components/AxisControls.tsx`, `../graph-view/components/ForceMap.tsx` |
| `../graph-view/components/controls/PopContext.tsx` | manifest |  | **5** files |
| `../graph-view/components/controls/Slider.tsx` | manifest |  | **4** files |
| `../graph-view/components/controls/SubTab.tsx` | manifest |  | `../graph-view/components/GravityControls.tsx`, `../graph-view/components/PushPullControls.tsx` |
| `../graph-view/components/controls/bucketColor.ts` | manifest |  | `../graph-view/components/AxisControls.tsx`, `../graph-view/components/ChargeControls.tsx`, `../graph-view/components/SpringControls.tsx` |
| `../graph-view/components/graph-view/present.ts` | manifest |  | **4** files |
| `../graph-view/components/graph-view/useHighlight.ts` | manifest |  | `../graph-view/components/GraphView.tsx` |
| `../graph-view/components/graph-view/useOntology.ts` | manifest |  | **13** files |
| `../graph-view/components/graph-view/useRecentlyChanged.ts` | manifest |  | `../graph-view/components/GraphView.tsx`, `../graph-view/index.ts` |
| `../graph-view/components/graph-view/useSimulation.ts` | manifest |  | `../graph-view/components/GraphView.tsx` |
| `../graph-view/components/graph-view/useSimulationLoop.ts` | manifest |  | `../graph-view/components/GraphView.tsx` |
| `../graph-view/components/graph-view/useTheme.ts` | manifest |  | `verify/scheme-probes.ts`, `../graph-view/components/GraphView.tsx`, `../graph-view/index.ts` |
| `../graph-view/components/graph-view/useViewport.ts` | manifest |  | `../graph-view/components/GraphView.tsx` |
| `../graph-view/components/graph-view/useVisibleGraph.ts` | manifest |  | `../graph-view/components/GraphView.tsx` |
| `../graph-view/components/graph-view/visibleGraph.ts` | manifest |  | **8** files |
| `../graph-view/components/icons/SearchIcon.tsx` | manifest |  | `../graph-view/components/FilterBar.tsx` |
| `../graph-view/filter/reconcile.ts` | manifest |  | `verify/static-golden.ts`, `../graph-view/index.ts` |
| `../graph-view/filter/toggle.ts` | manifest |  | `verify/static-golden.ts`, `../graph-view/components/FilterBar.tsx` |
| `../graph-view/filter/types.ts` | manifest |  | **17** files |
| `../graph-view/graph/dimension.ts` | manifest |  | **24** files |
| `../graph-view/graph/forces.ts` | manifest |  | **20** files |
| `../graph-view/graph/groups.ts` | manifest |  | `verify/seam-probes.ts`, `../graph-view/components/GraphView.tsx`, `../graph-view/index.ts` |
| `../graph-view/graph/highlight.ts` | manifest |  | `verify/tier-a.ts`, `../graph-view/components/graph-view/useHighlight.ts` |
| `../graph-view/graph/model.ts` | manifest |  | **21** files |
| `../graph-view/graph/node-scale.ts` | manifest |  | **4** files |
| `../graph-view/graph/ontology.ts` | manifest |  | **14** files |
| `../graph-view/graph/rng.ts` | manifest |  | **4** files |
| `../graph-view/graph/scalar.ts` | manifest |  | **10** files |
| `../graph-view/graph/scheme.ts` | manifest |  | **10** files |
| `../graph-view/graph/simulation.ts` | manifest |  | **26** files |
| `../graph-view/graph/taxonomy.ts` | manifest |  | **7** files |
| `../graph-view/graph/viewport.ts` | manifest |  | **4** files |
| `../graph-view/index.ts` | manifest |  | **11** files |

## Files nothing imports

An entry point, dead code, or a symbol whose only reader is the harness —
the third is F15, and no gate counts readers.

- `src/lib.ts` (neither)
- `src/main.tsx` (neither)
- `src/verify/main.ts` (neither)

## Files only the harness imports

A golden row keeps these looking alive (F15). Each one is either a symbol the
product will read in a later unit, or dead code with a pin.

- `src/verify/filter-states.ts` (neither) — verify/tier-a.ts
- `src/verify/fixtures.ts` (neither) — verify/main.ts, verify/scalar-probes.ts, verify/seam-probes.ts, verify/tier-a.ts, verify/tuning-probes.ts, verify/view-probes.ts
- `src/verify/force-probes.ts` (neither) — verify/static-golden.ts
- `src/verify/host-probes.ts` (neither) — verify/static-golden.ts
- `src/verify/ontology-probes.ts` (neither) — verify/static-golden.ts
- `src/verify/rng.ts` (neither) — verify/force-probes.ts, verify/tier-b.ts, verify/tuning-probes.ts, verify/view-probes.ts
- `src/verify/scalar-probes.ts` (neither) — verify/static-golden.ts
- `src/verify/scheme-probes.ts` (neither) — verify/static-golden.ts
- `src/verify/seam-probes.ts` (neither) — verify/static-golden.ts
- `src/verify/snapshot.ts` (neither) — verify/force-probes.ts, verify/host-probes.ts, verify/main.ts, verify/ontology-probes.ts, verify/scalar-probes.ts, verify/scheme-probes.ts, verify/seam-probes.ts, verify/static-golden.ts, verify/synthetic-visible.ts, verify/tier-a.ts, verify/tier-b.ts, verify/tier-c.ts, verify/tuning-probes.ts, verify/view-probes.ts
- `src/verify/static-golden.ts` (neither) — verify/main.ts
- `src/verify/synthetic-visible.ts` (neither) — verify/static-golden.ts
- `src/verify/tier-a.ts` (neither) — verify/main.ts, verify/scalar-probes.ts, verify/seam-probes.ts, verify/tuning-probes.ts, verify/view-probes.ts
- `src/verify/tier-b.ts` (neither) — verify/main.ts
- `src/verify/tier-c.ts` (neither) — verify/main.ts
- `src/verify/tuning-probes.ts` (neither) — verify/static-golden.ts
- `src/verify/view-probes.ts` (neither) — verify/static-golden.ts
