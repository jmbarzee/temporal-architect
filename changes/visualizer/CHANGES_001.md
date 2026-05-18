# Visualizer Spec Changes

## Hover Tooltip + Selection Deferral

**Date:** 2026-02-25
**Files changed:** `tools/visualizer/spec/GRAPH_VIEW.md`, `VISUALIZER_DEFERRED.md`

### Summary

The selection interaction model (click-to-select, persistent highlight, side panel) has been deferred in favor of a lighter hover-first approach. The hover tooltip is expanded to carry the identity and connection information that would otherwise require opening a panel.

### Changes

#### GRAPH_VIEW.md — § Hover: Dependency Highlighting

**Before:** Last two bullets were:
- "Show a tooltip with the hovered node's full name and type."
- "A direction indicator ... 'dependencies' / 'dependents'"

**After:** Replaced with a single **hover info tooltip** containing:
1. Node name, type icon + label, parent (worker for L3, namespace for L2), source file.
2. Immediate connection counts: N outgoing ("depends on"), M incoming ("depended on by").
3. Direction indicator: "dependencies" (default) or "dependents" (Shift held).

The direction indicator spec (previously its own item) is now integrated into the tooltip.

#### GRAPH_VIEW.md — § Selection

**Before:** Full spec for click-to-select: persistent highlight, info panel trigger, Escape-to-deselect.

**After:** Deferred stub — references VISUALIZER_DEFERRED.md § Node Selection. Notes that the hover tooltip serves the immediate discoverability need.

#### GRAPH_VIEW.md — § Info Panel

**Before:** Full spec for the structured side panel (identity, connections, blast radius, navigation, layout, lifecycle).

**After:** Deferred stub — references VISUALIZER_DEFERRED.md § Node Selection.

#### VISUALIZER_DEFERRED.md

Updated the "Selection Info Panel" row to "Node Selection + Info Panel" with full motivation context: hover is transient, selection is for locking context while reading a panel or panning. Original spec remains readable in git history.

### Implementation Impact

- **Groups 1–5** of VISUALIZER_ALIGNMENT_REVISIONS.md are unaffected (all complete).
- **Group 6** (Info Panel) is now deferred — no implementation needed in this cycle.
- **Group 7** (Direction Indicator Label) scope changes: the canvas-drawn direction label becomes part of the hover tooltip implementation, not a standalone label.
- **Groups 8** (Density Management) is unaffected.
- The existing `selectedNodeId` state in `GraphView.tsx` and the selection ring in `GraphCanvas.tsx` remain in the codebase as stubs — they are not actively harmful and removal can follow when selection is revisited.
