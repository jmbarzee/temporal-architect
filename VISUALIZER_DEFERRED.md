# Visualizer — Deferred Features

Features the visualizer spec ([tools/visualizer/spec/](tools/visualizer/spec/))
references but has consciously deferred. Each entry records the intent and the
reason it is not in the current scope, so the design isn't re-derived later. This
is a parking lot, not a commitment.

---

## Node Selection

Referenced by [GRAPH_VIEW.md](tools/visualizer/spec/GRAPH_VIEW.md) § Interaction
States. Persistent node selection (click to select, selection survives hover
changes, drives a detail panel). The interactive hover tooltip currently serves
the immediate identity / connection-discoverability need without persistent
selection state, so selection is deferred until a workflow demands it.

## Info Panel

Deferred alongside Node Selection. A side panel showing the full detail of a
selected node (signature, source, composition, all connections). The hover
tooltip covers the glanceable subset today.

---

## Decomposition Recompute

The Graph view's **Decomposition Group Overlay** (GRAPH_VIEW.md § Decomposition
Group Overlay) consumes a **precomputed** decomposition. Recomputing it from new
analysis parameters (ceiling, floor, strategy set, max-depth) requires re-running
the Go traversal (`twf graph chunks`).

- **Architecture:** separate the *view* tools (browse/select/hover groups —
  client-side, instant) from the *change* tools (parameters — a recompute that
  resets the current selection). A new host **request → response vector**: the
  webview posts a `recomputeDecomposition(params)` request; the host runs the CLI
  and posts back a fresh decomposition. The Params tab becomes editable, gated on
  a host `canRecompute` capability.
- **Standalone catch:** the browser standalone has no Go runtime, so live
  recompute there needs WASM-compiling `parser/decompose` or a small server — a
  separable project. Standalone stays read-only until then.
- **UX:** recompute is an explicit "Apply" action (not live sliders) so the
  selection reset is honest and the round-trip is debounced.

## Decomposition Coloring

v1 uses a simple cycling palette with the modal as the legend and hover-strengthen
for differentiation. Smarter assignment is deferred:

- **Structural map-coloring** — reuse a small palette so only *adjacent* groups
  must differ. The catch: there is no 2D boundary, so "adjacent" must be defined
  **structurally** (groups sharing an edge, or neighbors in the dependency DAG),
  not geographically.
- **Stable semantic hue** — a dominant shared group (small in definition, large in
  deployment/use — the articulation-point service) keeps one consistent color;
  smaller groups vary.

## Decomposition Glow Metric Encoding

Encode a group metric (effective complexity `Ec`, or member count) in the glow
**radius / intensity** as a second perceptual channel independent of hue — a heavy
group reads as a large soft halo, a light one as a tight one.

## Decomposition Alternatives at Depth

Today the engine retains the full ranked **portfolio only at the top level of each
chunk** (`Chunk.divisions`); recursion keeps a single best sub-division per
section. "Break open to see other possibilities" therefore works only at the chunk
level. Retaining **one-level-deep candidate alternatives** at every section (the
losers `bestDivision` already computes, stored flat with best-only expansion
beneath) would let the modal break open any node — a bounded engine change
(`tools/lsp/parser/decompose`), distinct from the rejected exponential full
alternative tree.

## Decomposition Cohesion Force

A soft spatial-grouping aid: boost the **link stiffness** on edges whose endpoints
are in the same active group, so members drift together without a dedicated
clustering force. Reuses the existing per-edge spring system (GRAPH_VIEW.md
§ Control Panel → PULL). Not a new gravity force.

## Decomposition Advisory Surfacing

The decomposition carries `suggestContract` advisories (`Chunk.advisories`) — a
heavily-shared workflow hub that is an articulation point, suggesting promotion to
a Nexus contract boundary. Surfacing these in the graph (e.g. a node badge or a
modal callout) is deferred; orthogonal to the groups overlay.
