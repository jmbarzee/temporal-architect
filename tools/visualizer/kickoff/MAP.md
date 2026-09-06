# Structural map — generated, do not edit

`npm run map` regenerates this; `npm run map -- --check` fails if it is stale.
It is not a gate. It exists because "who imports this" and "which zone is
this in" were being answered by grep, repeatedly, and wrongly.

**zone** — `manifest` is the library-to-be (the three ratchets measure it and
Unit 8 moves it); `shim` is the host half; `neither` is measured by nothing,
which is worth noticing rather than assuming.

| file | zone | leak | imported by |
|---|---|---:|---|
| `App.tsx` | neither | 5 | `main.tsx` |
| `adapter/build.ts` | shim | 59 | **6** files |
| `adapter/edge-types.ts` | shim | 165 | **5** files |
| `adapter/node-type-styles.ts` | shim | 1 | `App.tsx`, `lib.ts`, `verify/static-golden.ts` |
| `adapter/node-types.ts` | shim | 103 | **13** files |
| `adapter/useGraphModel.ts` | shim | 3 | `components/GraphView.tsx` |
| `components/CanvasErrorBoundary.tsx` | manifest |  | `components/GraphView.tsx` |
| `components/ChargeControls.tsx` | manifest |  | `components/GraphControlPanel.tsx` |
| `components/FilterBar.tsx` | manifest | 3 | `components/GraphView.tsx`, `components/TreeView.tsx` |
| `components/ForceMap.tsx` | manifest |  | `components/ChargeControls.tsx`, `components/GravityControls.tsx`, `components/SpringControls.tsx` |
| `components/GraphCanvas.tsx` | manifest | 3 | `components/GraphView.tsx` |
| `components/GraphControlPanel.tsx` | manifest |  | `components/GraphCanvas.tsx`, `components/GraphView.tsx`, `components/graph-view/useHighlight.ts` |
| `components/GraphView.tsx` | manifest | 30 | `components/WorkflowCanvas.tsx` |
| `components/GravityControls.tsx` | manifest | 4 | `components/GraphControlPanel.tsx` |
| `components/GroupsModal.tsx` | neither | 7 | `components/GraphView.tsx` |
| `components/PinToggle.tsx` | manifest |  | `components/FilterBar.tsx` |
| `components/SpringControls.tsx` | manifest |  | `components/GraphControlPanel.tsx` |
| `components/StyleGuide.tsx` | neither | 62 | `components/VisualizerHost.tsx`, `lib.ts` |
| `components/TreeView.tsx` | neither | 54 | `components/WorkflowCanvas.tsx` |
| `components/VisualizerHost.tsx` | neither | 8 | `App.tsx`, `lib.ts` |
| `components/WorkflowCanvas.tsx` | neither | 65 | **9** files |
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
| `components/controls/Equation.tsx` | manifest |  | `components/GraphControlPanel.tsx`, `components/GravityControls.tsx` |
| `components/controls/Plot.tsx` | manifest |  | `components/ForceMap.tsx`, `components/GravityControls.tsx` |
| `components/controls/PopContext.tsx` | manifest |  | `components/GraphControlPanel.tsx`, `components/GravityControls.tsx`, `components/controls/Slider.tsx` |
| `components/controls/Slider.tsx` | manifest |  | `components/ForceMap.tsx`, `components/GraphControlPanel.tsx`, `components/GravityControls.tsx` |
| `components/graph-view/useHighlight.ts` | manifest | 10 | `components/GraphView.tsx` |
| `components/graph-view/useOntology.ts` | manifest |  | **10** files |
| `components/graph-view/useSimulation.ts` | manifest |  | `components/GraphView.tsx` |
| `components/graph-view/useSimulationLoop.ts` | manifest |  | `components/GraphView.tsx` |
| `components/graph-view/useViewport.ts` | manifest |  | `components/GraphView.tsx` |
| `components/graph-view/useVisibleGraph.ts` | manifest |  | `components/GraphView.tsx` |
| `components/graph-view/visibleGraph.ts` | manifest | 19 | **6** files |
| `components/icons/GearIcons.tsx` | neither | 2 | `components/FilterBar.tsx`, `theme/temporal-theme.tsx` |
| `components/protocol.ts` | neither | 3 | **6** files |
| `filter/reconcile.ts` | manifest | 1 | `components/WorkflowCanvas.tsx`, `verify/static-golden.ts` |
| `filter/storage.ts` | manifest | 5 | `components/WorkflowCanvas.tsx` |
| `filter/toggle.ts` | manifest |  | `components/FilterBar.tsx`, `verify/static-golden.ts` |
| `filter/types.ts` | manifest |  | **15** files |
| `graph/dimension.ts` | manifest |  | **27** files |
| `graph/edge-styles.ts` | manifest | 58 | **4** files |
| `graph/forces.ts` | manifest |  | **5** files |
| `graph/groups.ts` | manifest | 1 | `components/GraphView.tsx`, `components/GroupsModal.tsx` |
| `graph/highlight.ts` | manifest |  | `components/graph-view/useHighlight.ts` |
| `graph/model.ts` | manifest | 12 | **19** files |
| `graph/node-scale.ts` | manifest |  | **4** files |
| `graph/ontology.ts` | manifest |  | **9** files |
| `graph/rng.ts` | manifest |  | **4** files |
| `graph/simulation.ts` | manifest | 5 | **20** files |
| `graph/taxonomy.ts` | manifest | 1 | **7** files |
| `graph/viewport.ts` | manifest |  | **4** files |
| `lib.ts` | neither | 24 | — |
| `main.tsx` | neither |  | — |
| `theme/temporal-theme.tsx` | shim | 78 | **9** files |
| `types/ast.ts` | shim | 26 | **18** files |
| `types/decomposition.ts` | shim | 3 | **7** files |
| `types/parser-graph.ts` | shim | 3 | **8** files |
| `types/payload.ts` | neither | 12 | `components/VisualizerHost.tsx`, `lib.ts`, `verify/fixtures.ts` |
| `verify/filter-states.ts` | neither | 13 | `verify/tier-a.ts` |
| `verify/fixtures.ts` | neither | 10 | `verify/main.ts`, `verify/tier-a.ts` |
| `verify/force-probes.ts` | neither | 14 | `verify/static-golden.ts` |
| `verify/main.ts` | neither |  | — |
| `verify/ontology-probes.ts` | neither | 47 | `verify/static-golden.ts` |
| `verify/rng.ts` | neither |  | `verify/force-probes.ts`, `verify/tier-b.ts` |
| `verify/snapshot.ts` | neither |  | **8** files |
| `verify/static-golden.ts` | neither | 14 | `verify/main.ts` |
| `verify/synthetic-visible.ts` | neither | 31 | `verify/static-golden.ts` |
| `verify/tier-a.ts` | neither | 6 | `verify/main.ts` |
| `verify/tier-b.ts` | neither |  | `verify/main.ts` |
| `verify/tier-c.ts` | neither | 13 | `verify/main.ts` |

## Files nothing imports

An entry point, dead code, or a symbol whose only reader is the harness —
the third is F15, and no gate counts readers.

- `src/lib.ts` (neither)
- `src/main.tsx` (neither)
- `src/verify/main.ts` (neither)
