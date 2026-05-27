# Visualizer: Nexus Presentation in the Graph View

Follow-on to [visualizer/REVISIONS_003](./REVISIONS_003.md). That revision rewires the graph view
to consume `twf graph` and introduces `endpoint` as a new node kind. This revision designs the
**visual treatment** for the full nexus surface — services, operations, and endpoints — so they
read as a cohesive group in the canvas.

## Problem Statement

The current graph view has two gaps in nexus presentation:

1. **Nexus endpoints aren't shown.** Endpoints are first-class in the DSL — they carry the task
   queue that determines all nexus dispatch routing — but the visualizer treats them as a string
   label on call edges (`nexusEndpoint`) and never materializes them as nodes. A reader can't
   see "this endpoint exists in this namespace, on this queue, fronting calls from these
   workflows".

2. **Services and operations don't visually cluster.** Today services live at L2 alongside
   workers (because they're worker-hosted) and operations at L3 alongside workflows. They take
   the visualizer's default colors and icons, so a user can't tell at a glance "this whole group
   is nexus surface" — they have to read names.

Both fall out naturally once the parser emits endpoint nodes (parser/REVISIONS_003) and the
visualizer's tier/style machinery is taught about them.

## Scope

### Group 1: NexusEndpoint node tier and parent

- **Tier:** L2 (peer to worker and nexusService). Endpoints are namespace-children, same
  structural position as workers in the namespace tier. They aren't hosted by a worker.
- **Parent:** namespace (emitted as a containment edge by parser/REVISIONS_003).
- **NodeType union:** add `'nexusEndpoint'` to the `NodeType` enum in
  `tools/visualizer/src/graph/model.ts` and to the visualizer's tier mapping.

### Group 2: Visual treatment — color, icon, label

A single visual identity unifies the nexus surface. Pick one hue family (red/pink) for all three
kinds, with subtle differentiation:

| Kind | Color | Icon |
|---|---|---|
| `nexusService` | Mid-pink, e.g. `#ec4899` (Tailwind `pink-500`) | Service glyph (TBD — current visualizer convention) |
| `nexusOperation` | Lighter pink, e.g. `#f9a8d4` (Tailwind `pink-300`) — leaf of the family | Operation glyph (TBD) |
| `nexusEndpoint` | Red-pink, e.g. `#e11d48` (Tailwind `rose-600`) — emphasizes "entry point" | Endpoint glyph (TBD; arrow / portal / inbox-like) |

(Exact hex codes are placeholders; final palette pick in design review.)

The endpoint's hue is the strongest of the three to convey "external boundary / RPC entry
point". Service and operation share the lighter family because they're internal implementation.

**Hover badge / label:** endpoint hover shows `namespace · queue`. Service hover shows
`worker · queue`. Operation hover shows `service · worker · queue`. Consistent format:
`<parent context> · <task queue>`.

### Group 3: Filter consolidation

**Before:** the visualizer's control panel may have per-type filters (workflow / activity /
nexusService / nexusOperation). Adding endpoint as another row makes this list longer and harder
to read.

**After:** collapse `nexusService`, `nexusOperation`, and `nexusEndpoint` into a single `Nexus`
filter toggle. Toggling it off hides all three kinds and any `nexusCall` edges touching them.
The "what's in the group" detail is shown in the control panel hover/expand.

### Group 4: Force simulation categories

The graph view's force simulation in `tools/visualizer/src/graph/simulation.ts` assigns force
categories (charge, link, collision) per node type. Endpoints need entries; service and
operation forces may need rebalancing so the nexus cluster reads cohesively rather than as three
disconnected types.

Specific changes:

- **`nexusEndpoint`:** charge similar to worker (they're peers in the namespace tier). Collision
  radius matching worker icon size.
- **`nexusService` / `nexusOperation`:** unchanged unless visual testing reveals readability
  issues with the new endpoint nodes pulling them apart.
- **Optional: cluster force.** If services / operations / endpoints don't naturally cluster by
  the default forces, add a soft cluster force that pulls "nexus kind" nodes together within
  their namespace. Tunable; may not be necessary.

### Group 5: Hover-time endpoint association

The graph view should make "this endpoint routes calls to these services" visually obvious, but
parser/REVISIONS_003 (correctly) doesn't emit endpoint→service edges — an endpoint is
namespace-scoped routing, agnostic of which services happen to share its queue. The relationship
is real only at call sites, where `nexusCall.routing.nexusEndpoint` references the endpoint.

Visual approach:

- **Hover on a `nexusEndpoint` node:** highlight all `nexusCall` edges whose
  `routing.nexusEndpoint === node.id`. The caller and target nodes of those edges light up
  alongside, making the routing fan-out instantly visible.
- **Hover on a `nexusCall` edge:** highlight the referenced endpoint node (and its namespace).
- **Hover on a `nexusService` deployment:** highlight all endpoints whose queue+namespace match
  this service's deployment. This is a derived inference computed at hover time — same idea as
  the dropped "fronts" edges, but rendered transiently as highlight state rather than
  materialised as edges.

No new edge type. No new data flow. Just hover behaviour over the existing graph.

## Files Touched

| File | Change |
|------|--------|
| `tools/visualizer/src/graph/model.ts` | Add `'nexusEndpoint'` to `NodeType`; update `nodeLevel` mapping |
| `tools/visualizer/src/graph/build.ts` | Handle the new kind in `tierOf` / `kindOf` (small addition, mostly handled by the generic translator from REVISIONS_003) |
| `tools/visualizer/src/components/GraphCanvas.tsx` | Color and icon for `nexusEndpoint` nodes; consistent nexus-family styling; hover-based endpoint association highlighting |
| `tools/visualizer/src/components/GraphControlPanel.tsx` | Collapse nexus kinds into a single `Nexus` filter row |
| `tools/visualizer/src/graph/simulation.ts` | Force category for `nexusEndpoint`; optional cluster force for nexus group |
| `tools/visualizer/src/styles/index.css` | Color tokens for the nexus family if not already present |
| `tools/visualizer/spec/GRAPH_VIEW.md` | Document `nexusEndpoint` nodes, the unified nexus filter, hover-based routing association, and the visual identity |

## Open Questions

1. **Tier choice for endpoints: L2 vs new tier?** L2 is the namespace-children tier today
   (workers + services). Endpoints share that structural position. Alternative: a new L1.5 or
   a separated "external boundary" tier. L2 is simpler; deviate only if visual testing shows
   it.

2. **Hover content for `nexusEndpoint` nodes.** Endpoints don't have a separate AST definition
   node — they live as `NamespaceDef.endpoints[i]` entries. Hover lookup is "find the namespace
   matching `node.namespace`, find the endpoint by name". Simple, but worth noting since other
   node types have a direct AST-by-name lookup.

3. **Are services / operations actually misrendered today, or just unstyled?** Worth a quick
   look at the current canvas before committing to a color refresh. If they're fine and only
   endpoints need adding, this revision shrinks to "add `nexusEndpoint` node visuals +
   hover-based routing association + filter consolidation".

4. **Cluster force tuning.** Optional. Worth testing both with and without before committing.

## Dependencies

- **Blocked by [visualizer/REVISIONS_003](./REVISIONS_003.md)** — endpoint nodes don't exist
  in the visualizer's input until 003 lands. (Which itself depends on parser/REVISIONS_003.)
- **Independent of parser/REVISIONS_002** and the per-worker duplication feature.

## Outcome

- Nexus endpoints are first-class on the canvas — readers see entry points, their namespaces,
  and their task queues at a glance.
- Services, operations, and endpoints read as a cohesive nexus group via shared color family
  and unified filter.
- The force simulation handles the new node count gracefully (no overlap, no awkward isolation).
- The control panel stays clean despite the new node kind — one toggle for nexus, not three.
