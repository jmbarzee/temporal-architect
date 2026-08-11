# Visualizer Changes: Render the cross-workflow signal send

**Source review(s):** overdue downstream propagation from `internal/changes/dsl/CHANGES_003.md` and `internal/changes/parser/CHANGES_001.md` (cross-workflow signal send). Surfaced by an audit of every completed CHANGES record during the backlog→GitHub-issues migration; tracked as [#46](https://github.com/jmbarzee/temporal-architect/issues/46).
**REVISIONS file(s):** none (propagation of an already-shipped upstream change).

## Summary

The parser has emitted `SignalSendStmt` and a distinct `signalSend` graph edge since `parser/CHANGES_001.md`, but the visualizer consumed neither. A `signal handle.Name(args)` statement **rendered as nothing** — `StatementBlock` had no case for it and fell through to `default: return null` — and the graph edge collapsed into the generic workflow↔workflow dependency spring, drawn identically to a child-workflow call.

Both are now first-class. The construct is visible in the tree view, navigable to its resolved target, counted in the definition summary, indexed for "show callers", and springs on its own softer physics in the graph.

## Changes by Type

### Semantic

- **`src/graph/model.ts`**: `GraphEdge` gains an optional `dispatchKind?: 'signalSend'`. The edge-type registry resolves by `(edgeType, sourceNodeType, targetNodeType)`, but a signal send and a child-workflow call are *both* workflow → workflow — the endpoint types cannot separate them, so the parser's edge kind is carried through as the discriminator. Deliberately narrow (one literal, not the full `ParserEdgeKind`) so it stays a disambiguator rather than a second parallel taxonomy.
- **`src/graph/edge-types.ts`**: new `linkSignalSend` edge type (`Wf→Sig`, dependency, **directional**), physics `{ strength: 0.30, distance: 520 }` — weaker and longer than the `Wf↔Wf` call spring (`0.50 / 420`) on purpose. A signal send couples two workflows without binding them; the sender never waits on the receiver's handler, so the layout should let them drift rather than clamp them together. `edgeTypeFor` checks `dispatchKind` first in the dependency branch, before the node-type rules.
- **`src/graph/build.ts`**: `parserEdgeToViewEdge` sets `dispatchKind` when the parser edge kind is `signalSend`.

### Internal

- **`src/components/blocks/LeafBlocks.tsx`**: new `SignalSendBlock`. A leaf block — statement-only and fire-and-forget, so there is no result to expand into. Renders `handle.Signal(args)`, and when the resolver has followed the handle to a target workflow it offers a "Def" jump via `ContextualNavButtons`; when it hasn't, it carries the same `block-unresolved` treatment and `?` badge the call blocks use.
- **`src/components/blocks/StatementBlock.tsx`**: `case 'signalSend'` added to the dispatch switch.
- **`src/components/blocks/DefinitionBlock.tsx`**: `computeSummary` counts sends **separately** from calls (`"2 calls, 1 send"`). Folding a send into the call count would overstate the request/response surface — a send dispatches but returns nothing.
- **`src/components/TreeView.tsx`**: the caller-index walk records a `signalSend` as an inbound reference on `stmt.resolved.name`, so "show callers" on a signal-receiving workflow now lists its senders. Guarded on `resolved` — an unresolved handle has no target to attribute.
- **`src/types/ast.ts`**: re-export `SignalSendStmt` from `@temporal-architect/wire-types`. The façade had never listed it, which is why the statement type was unreachable from component code.
- **`src/components/blocks/blocks.css`**: `.block-signal-send` reuses the existing `--block-signal-*` palette (defined for both light and dark themes) — the arrival and the send are the same domain concept seen from opposite ends.

### Documentation

- **`tools/visualizer/spec/GRAPH_VIEW.md`**: `Wf→Sig` added to both dependency-category lists (§ Force Model, § Control Panel → PULL), with a note on why it needs the parser's edge kind rather than node types to resolve, and why its spring is weaker.

## Verification

`tsc --noEmit` and `npm run build` clean. Verified end-to-end against a fixture design carrying a handle-bound send: `twf parse` emits the `signalSend` statement with `resolved.name` populated, and `twf graph --json` emits exactly one `signalSend` edge distinct from the `workflowCall` edge in the same design.

## Deferred

- **Filter toggle.** `CHANGES_003` also asked for `signalSend` to be its own filterable category. The visualizer has **no edge-type toggles at all** today, so this waits on the unified filter bar ([#49](https://github.com/jmbarzee/temporal-architect/issues/49)) rather than growing a one-off signal-specific filter — which `parser/CHANGES_001.md` explicitly warned against.

## Downstream propagation

None. The visualizer is a leaf consumer here; no wire-contract, parser, or skill change is implied. The VS Code extension (separate repo `jmbarzee/temporal-architect-dist`) consumes the published visualizer library and picks this up on the next version bump — it hand-maintains no copy of the wire contract, so no coordinated edit is required there.
