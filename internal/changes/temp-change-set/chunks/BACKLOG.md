# chunks — decomposition workstream (backlog)

Topology-based graph decomposition: "what are the composable chunks of work, and
where must / where could the work be split?" It **informs; it does not impose**.
The harness skill uses it to break implementation out to author subagents at
contract boundaries; the visualizer renders it as a group overlay.

The feature shipped (engine + visualizer overlay + extension wiring) — see
[`STATE.md`](./STATE.md) for the current-state orientation and file map. This file
is the forward-looking parking lot: deferred and open work only.

---

## Deferred — decomposition engine

- **Loop cut ceiling** — a raised ceiling above which a loop's subtrees (then,
  last resort, community detection) may be cut. Loops are never cut until this
  lands.
- **Chunk ↔ impl reconciliation** — a first-class staleness signal tying chunk
  identity + the `# impl:` link + a quick verify into "this chunk's
  implementation is in/out of sync with its `.twf`", so the harness can skip
  unchanged chunks. Shares a surface with drift detection.
- **Deployment "group up" phase (worker / namespace grouping lens)** — an
  optional, configurable phase *after* the "cut up" phase (the call/contract
  partition + explore). Where "cut up" answers *"what must be authored together"*
  (call/contract coupling), "group up" answers the gentler *"what ships /
  co-locates together"* over the **same node set**, riding the retained per-node
  `Node.Workers` / `Node.Namespaces` (and nexus tiers). It generalizes the existing
  `worker` / `namespace` **division strategies** (`splitByAttr`, which today only
  *split* an over-ceiling chunk) into a first-class alternate grouping the
  visualizer overlay can toggle (`group by: call | worker | namespace`).

  Relatedness is a **hierarchy, gentler = coarser**: `call/contract chunk ⊂ worker
  ⊂ namespace`. These are nested lenses, not competing partitions.

  **Invariant — never merge the authorship partition.** Co-location is a
  *deployment* fact, not a code-coupling one: two unrelated workflows sharing a
  worker are still two independently-authorable units, and folding them into one
  chunk would drag unrelated code into one agent's context (the opposite of the
  North Star). So "group up" is a **parallel lens emitted alongside** the
  call-structure chunks — it MUST NOT add edges into the binding+soft WCC
  partition. Its only permitted influence on the call lens is *soft*: a ranking
  **tie-breaker** (prefer divisions that keep co-hosted nodes together) and a
  layout **cohesion force** (nudge co-hosted nodes together) — nudges, never a
  merge.

  **Purpose fork (decide before building):** *comprehension* → a visualizer
  grouping lens (clean, additive, the recommended framing); vs *authorship /
  orchestration* → at most a scheduling/batching hint for the harness ("same worker
  → same agent for context-locality"), still not a partition change.

  **DSL gap:** *why* things are co-hosted (incidental vs. intentional shared
  state / task queue / resource pool) isn't expressed in `.twf` today, so the
  engine must treat all co-location as the same gentle weight until the DSL can
  distinguish intent — worth a line in `dsl/BACKLOG.md`.

  Note the parser graph *already* models worker/namespace containment + coarsening,
  so comprehension is partly served by the existing graph levels; the net-new work
  is surfacing deployment as a grouping dimension of the **chunk overlay**. Lower
  priority than first assumed — a nice-to-have refinement, not a correctness gap.
  Likely promote to `parser/BACKLOG.md`.
- **#7 declared inbound roots** — additively sharpens root identification
  (`source: declared`); see `dsl/BACKLOG.md` → *Connecting In and Out of Temporal*.
- **#1b language boundaries** — depends on `@lang` annotations; reads the retained
  per-node deployment attributes; additive to the #1 partition.
- **Alternatives at depth** — recursion keeps only the single best sub-division
  per section; the full ranked portfolio exists only at the chunk top level.
  Retaining *one-level-deep* candidate alternatives per section (the losers
  `bestDivision` already computes) would let the visualizer modal "break open" any
  node. Bounded change; distinct from the rejected exponential full alternative
  tree.
- **Metric: replace, not just augment** — `Ec` currently drives only explore-phase
  decisions; the public `complexity` scalar and the ceiling/floor stay additive
  `N` (see [`STATE.md`](./STATE.md) for the metric mechanics). Letting `Ec` drive
  the public scalar + thresholds is a clean future option.

---

## Deferred — decomposition overlay (visualizer)

The Graph-view group overlay shipped read-only (precomputed decomposition, simple
cycling palette, modal-as-legend). Deferred polish:

- **Recompute** — the overlay consumes a precomputed decomposition; re-running it
  from new analysis parameters (ceiling, floor, strategy set, max-depth) needs a
  host **request → response vector**: the webview posts `recomputeDecomposition`,
  the host runs the CLI and posts back a fresh decomposition, and the Params tab
  becomes editable (gated on a host `canRecompute` capability). Separate the
  *view* tools (instant, client-side) from the *change* tools (a recompute that
  resets the selection); recompute is an explicit "Apply" so the reset is honest.
  Standalone has no Go runtime, so live recompute there needs WASM-compiling
  `parser/decompose` or a small server — a separable project; standalone stays
  read-only until then.
- **Coloring** — v1 uses a small cycling palette with the modal as the legend and
  hover-strengthen for differentiation. Smarter assignment: **structural
  map-coloring** (reuse a small palette so only *adjacent* groups differ — and
  since there is no 2D boundary, "adjacent" must be defined structurally, by
  shared edges / neighbors in the dependency DAG) and a **stable semantic hue**
  for the dominant shared service (one consistent color; smaller groups vary).
- **Glow metric encoding** — encode a group metric (`Ec` or member count) in the
  glow **radius / intensity** as a second perceptual channel independent of hue.
- **Cohesion force** — boost **link stiffness** on edges whose endpoints are in
  the same active group so members drift together, without a dedicated clustering
  force. Reuses the existing per-edge spring system (GRAPH_VIEW.md § Control Panel
  → PULL); not a new gravity force.
- **Bulk expand/collapse all** — the modal tree expands/collapses one row at a
  time via its disclosure caret. A bulk "expand all / collapse all" (over a chunk's
  active division, or the whole tree) was dropped from v1 for lack of an obvious,
  uncluttered home — it must stay visually distinct from the per-row disclosure
  carets (VIEW_FRAMEWORK.md § Expand/Collapse Affordance), e.g. a labeled control
  in the tab header or a clearly-different icon, not another caret.
- **Advisory surfacing** — the decomposition carries `suggestContract` advisories
  (`Chunk.advisories`); surfacing them in the graph (e.g. a node badge or modal
  callout) is deferred. Orthogonal to the groups overlay.

(Generic, non-decomposition visualizer deferrals — node selection, info panel,
etc. — live in [`../../visualizer/BACKLOG.md`](../../visualizer/BACKLOG.md).)

---

## Open questions (non-blocking)

- Default floor/ceiling values and metric weights — ship documented defaults,
  tune from real designs.
- Should `twf graph chunks` ever auto-apply the floor merge, or only recommend?
  (Lean: recommend only — consistent with informs-not-imposes.)
- Multi-file designs: verify cross-file resolution in a sampler fixture.
