# Visualizer Changes: Render options in the tree view

**Source:** Targeted visualizer task. The parser already parses and emits `options:` blocks in its `twf parse` JSON for every option-bearing node, and the visualizer's AST types modelled options on the call/namespace nodes — but no rendering component read them, so options never reached the screen. Handler declarations (signal/query/update) did not even carry the field in the TypeScript AST. Done outside the formal dev-cycle; recorded here.

## Summary

The tree view now renders `options:` blocks as a muted, read-only key/value section at the top of each expanded block body, covering activity/workflow/nexus calls, signal/query/update handlers, and namespace worker/endpoint entries. No parser or JSON-contract change — the data was already in the envelope. Spec updated in `tools/visualizer/spec/TREE_VIEW.md` (new § Options).

## Changes

- **Type gap closed** (`tools/visualizer/src/types/ast.ts`): added `options?: OptionsBlock` to `SignalDecl`, `QueryDecl`, and `UpdateDecl`. The five call/namespace node types already carried the field.
- **New `OptionsSection` component** (`tools/visualizer/src/components/blocks/OptionsSection.tsx`): a recursive renderer for an `OptionsBlock`, rendered as a **collapsible, neutrally-colored (control-palette) box**. Returns null when empty. Collapsed by default, the header shows an `options` label plus a muted summary of the top-level keys; expanded, it shows the key/value list (leaf entries as `key: value`, nested groups like `retry_policy`/`priority` indented one nesting level). Text size and color are constant at every nesting depth — only indentation changes — so deep option trees read calmly.
- **Wired into expanded bodies** with expandability fixes so a node carrying options expands even when it has no resolvable inline target:
  - `ActivityCallBlock` / `WorkflowCallBlock` / `NexusCallBlock` (`CallBlocks.tsx`): expandable when `isDefined || hasOptions` (nexus: `hasInlineBody || hasOptions`); options render above the inline definition body.
  - `HandlerDeclBlock` (`WorkflowContent.tsx`): expandable when `hasBody || hasOptions`; options render above the handler body.
  - `NamespaceWorkerEntry` (`DefinitionBlock.tsx`): expandable when `isDefined || hasOptions`; options render above the worker ref sections.
  - `NamespaceEndpointEntry` (`DefinitionBlock.tsx`): was never expandable; now expands when it has options to show them.
- **Styling** (`tools/visualizer/src/components/blocks/blocks.css`): added `.options-block` (+ `-header`/`-label`/`-summary`/`-body`), `.option-entry-list` / `.option-entry` / `.option-nested` / `.option-key` / `.option-value`. The box uses the neutral `--block-control-*` palette. Font size/family are set once on `.options-block-body` (12px mono) so nesting can't compound the size; key/value share one color and differ only by weight; depth changes indentation only (`.option-nested` → `var(--body-indent)`). The label is lowercase (no `text-transform: uppercase`). Dark theme inherits via the control palette + opacity.

**Files touched:** `tools/visualizer/src/types/ast.ts`, `tools/visualizer/src/components/blocks/OptionsSection.tsx` (new), `tools/visualizer/src/components/blocks/CallBlocks.tsx`, `tools/visualizer/src/components/blocks/WorkflowContent.tsx`, `tools/visualizer/src/components/blocks/DefinitionBlock.tsx`, `tools/visualizer/src/components/blocks/blocks.css`, `tools/visualizer/spec/TREE_VIEW.md`
**Change type:** `Internal` (no parser/JSON contract change). `tsc --noEmit` clean.
