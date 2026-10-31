# Decision Log

**§7.4. [living] — the agent appends. Never rewrite or delete an entry; supersede
it with a new one that references the old id.**

Required for: any golden `--write`, any §5.3 override, any deferral of a
denominator item, any user-visible behavior change, and any non-obvious choice a
later session or validator might otherwise relitigate.

Format: `Dn — decision — rationale — date — who`

---

## Settled at kickoff

**D1 — One elected dimension per feature; never compose across dimensions.**
Each feature (colour, push/pull, X axis, Y axis, each filter in the chain) picks
exactly one dimension. There is no precedence order, no summing of physics
contributions, and no multi-dimension style resolution. — This is what keeps the
model comprehensible and it is what the requirements describe; the alternative
(channel assignment across dimensions) has no expressible UI and no existing
analogue in the codebase. — kickoff — human

**D2 — The shim keeps declaring the spring table for `temporalType`; other
dimensions get a rule-based fallback.** The 15 hand-tuned `EdgeTypeId` springs
are preserved verbatim as shim-supplied data, so today's tuning survives exactly.
The library additionally supports `(mappedSource, mappedTarget) → spring`, and a
dimensional mapping keeps the token count bounded. Dimensions with no declared
table get one default spring. — A pure rule-based model would discard hand-tuning
that took interactive sessions to find, and `SpringControls` renders one
draggable token per entry, so an unbounded pair space has no control surface. If
the bounded-token property cannot be maintained, that is a §5.1 tripwire. —
kickoff — human

**D3 — Behavior-change budget.** Two visible changes are pre-approved and ride
along under §8.2: (a) the canvas becoming theme-aware, which alters every
dark-mode graph (T15); (b) filter chips counting nodes rather than AST
definitions (T18). A third is **not** approved: any reimplementation of
`edgeTypeFor` must hold Tier C byte-identical for the `temporalType` dimension.
— (a) and (b) are latent defects whose fix is an improvement; (c) is layout
physics with no way to notice a regression by eye. — kickoff — human

**D4 — Persisted state is versioned and discarded on shape mismatch.** No
migration path. — Pre-v1 (C5), and the failure mode of a bad migration is a blank
graph *and* a blank tree, since empty `visibleTypes` means hide-everything (T7).
The same key is read by the distribution repo's webview, so a wrong migration
propagates. Discarding costs a user their chip selection once. — kickoff — human

**D5 — The shim folder is created early (Unit 2); the library move happens last
(Unit 8).** In between, the leak gate polices the boundary. — The cut line runs
*mid-file* through five files, so moving early would thrash every subsequent
diff; but nothing would stop new leaks without a boundary. Creating `src/adapter/`
early makes everything left in `src/graph/` the library-to-be by construction,
and the ratchet enforces it. Unit 8 then becomes close to a pure directory move.
— kickoff — human

**D6 — The verification harness is bespoke and zero-dependency.** A second vite
lib entry bundled to `dist-verify/`, run with plain `node`. — C2 forbids new
dependencies; Node 22's `--experimental-strip-types` fails on this codebase's
extensionless imports and CI is on Node 20; `tsc`-then-`node` fights `noEmit` +
`moduleResolution: bundler`. — kickoff — human

**D7 — The new `Dimension` primitive unifies with the existing
`FilterDimension`; it does not coexist alongside it.** `filter/types.ts`'s
`'files' | 'types'` become the `sourceFile` and `temporalType` dimensions, and
`spec/VIEW_FRAMEWORK.md` § Per-Dimension Pinning describes the general case. —
Two different meanings of "dimension" in one codebase would make every occurrence
ambiguous, and the existing one is genuinely the same concept arriving early
(T24). — kickoff — human

**D8 — The visualizer spec is aligned to the new model, not split.** How to
divide it between the library and the shim is a later, separate decision. —
Splitting it now would commission a 13-way alignment review (T30) against code
that is still moving. — kickoff — human

**D9 — Fixtures are generated from the repository's own `.twf` corpus.** Three
additions (`nexus.twf`, `task-queues.twf`, `access-control.twf`), plus a synthetic
table for `edgeTypeFor`. — The committed fixture reaches only 4 of 7 node kinds,
0 coarsened edges and 1 source file, and `signalSend` — the highest-precedence
rule — is unreachable from any real file in the repo (T32). — kickoff — human

---

**D10 — The verify harness is split so it never needs node typings.**
`src/verify/main.ts` is typechecked, pure, and its only output is
`console.log`; `verify/run.mjs` is plain JS outside `tsconfig.json`'s `include`
and does all file I/O, diffing, and exit codes. — `@types/node` is **not
installed** (T33) and C2 forbids adding it, while `tsconfig.json` `include` is
`["src"]` with a DOM-only lib. `console` comes from the DOM lib, so the
typechecked half compiles; the untypechecked half is where `node:fs` lives.
— kickoff — human

**D11 — The injected RNG defaults to `Math.random` in production; only the
harness seeds it.** — Seeding production would make node layouts deterministic
across reloads, which is a user-visible behavior change nobody asked for and
which D3 does not cover. The nine call sites gain a parameter, not a new default.
— kickoff — human

**D12 — The leak manifest includes stylesheets.** `FilterBar.css:393-448` alone
holds eight hand-written Temporal chip tints (B30). — A manifest that counted
only `.ts`/`.tsx` would report a clean library while eight Temporal colour blocks
sat in the shipped stylesheet. The measured baseline is 583 across 41 files, of
which 57 are CSS. — kickoff — human

**D13 — Two carve-outs from C2, pre-approved so the plan cannot deadlock on its
own literalism**: a workspace-local `file:../<sibling>` link (Unit 8 needs it;
`wire-types` is the precedent), and hand-written ambient declarations for
platform builtins. Everything else, including `bundleTypes: true` — which pulls
in `@microsoft/api-extractor` (T31) — remains §8.3. — Without these, Unit 8 halts
on a link that is not a dependency in any meaningful sense. — kickoff — human

**D14 — Base node sizes belong to the colour-scheme input; there is no defect to
diagnose.** The kickoff draft carried an open question (O1) about a base-node-size
"defect", derived from a truncated line in the source requirements. Clarified at
kickoff: sizes simply ride the same injected scheme object as the palette, so one
input carries both and a consumer swapping schemes gets colour and per-value
radius/icon size together. R11 is an ordinary Unit 6 feature; O1 is retired
unasked. — kickoff — human

**D15 — Verification fans out; authoring never does.** The §3.2 review contract
is mechanism-agnostic: individual sub-agent calls and orchestrated workflows both
satisfy it. But code is authored by exactly one agent at a time, and that holds
even under a standing instruction to orchestrate by default — the unit chain is
strict and five of the hardest files split mid-file, so parallel authors would
conflict and per-agent worktrees would not help. `VERIFICATION.md` §3.5.2 names
the five verification fan-outs that are worth the orchestration over plain
sub-agent calls, and §3.5.3 names the two shapes that are not. — Without the
prohibition written down, a run launched with orchestration enabled by default
would apply it exactly where `PLAN.md` needs it not to be. — kickoff — human

**D3 addendum — the behavior-change budget is extended** to cover two changes
Unit 5a necessarily makes: (a) the T12 present-vs-all semantics choice for the
gravity overlay (record which you picked and why), and (b) band-occupancy
differences arising from X gaining a per-value band map where it had a single
global window. Both are §8.2. The list is otherwise closed — anything not named
in D3 is §8.3. — kickoff — human

---

## During the run

<!-- Append below. Do not edit above this line. -->

**D16 — Orchestration mechanism for the §3.2 review loop (§3.5.4 record).**
Commit-scope reviews are individual fresh sub-agents, one per commit, in order
(§3.5.3). PR-scope review is an orchestrated workflow combining §3.5.2(a) — six
blind lenses on the unit diff — with §3.5.2(b), one agent per named §3.3 cheat,
schema-validated, results reconciled by the root orchestrator. Of the five
fan-outs §3.5.2 names, this run will run (a)+(b) at every unit PR, (c) the
Counter A adversarial audit at Units 4, 6 and 8, (d) the blast-radius sweep at
every unit that owns B-rows (Unit 0 owns none), and (e) the multi-modal spec
sweep at Unit 9. Authoring is never fanned out (D15, §3.5.1). — Recorded before
the first review so a later session can tell what the run's throughput was set
by. — 2026-09-05 — agent

**D17 — Unit 0 emits `nodeType` in the Tier A node rows; Unit 2's
`**Goldens:** byte-identical` line cannot survive contact with R2.** The golden
records what exists, and at Unit 0 a node's identity *is* `nodeType`. When Unit 2
replaces it with a dimension map the node rows necessarily change shape, exactly
as `PLAN.md` §6.2 already anticipates for Unit 3's filter matrix. Proceeding on
the assumption that Unit 2 carries an **enumerated** golden change limited to the
node-identity rows, with every other Tier A row and all of Tier C byte-identical.
— Recorded under the §8.4 Unit 0 exception; the contradiction is logged in
`PROGRESS.md` § Open Questions as OQ1. — 2026-09-05 — agent

**D18 — `computeVisibleGraph` is lifted with today's parameters, not
`VERIFICATION.md` §3.1.2's four-argument `(nodes, edges, filter, ontology)`
shape.** No ontology type exists until Unit 1/2, and inventing one in Unit 0
would author the dimension model inside the unit whose only job is to observe it
(§5.1 attractor 8). The lift is therefore a **pure move**: same imports, same
body, same behavior, callable from the harness. The `ontology` parameter arrives
with the seam widening in Unit 1. — 2026-09-05 — agent

**D19 — Unit 0 lifts four things, not three.** §3.1.2 names
`computeVisibleGraph`, `edgeStyleFor` and `bandCenters`. A fourth is required by
the Tier A **filter-set identity** row, which §3.1.1 calls "the only detector for
T5": the two chip-toggle reducers are today inline lambdas inside `FilterBar`
(`toggleFile`, `toggleTypeGroup`), so a harness that scripts filter edits would
have to re-derive them — and a re-derivation would pass while production
diverged, the same failure Tier B invariant 2 is warned about. They move to
`src/filter/toggle.ts` verbatim and `FilterBar` calls them. Two smaller
additions ride along: each `EDGE_STYLE` entry gains a `key` field so the Tier A
style row records a legible key rather than a colour blob, and `edgeStyleFor`'s
two endpoint parameters widen from `SimNode` to the `{ nodeType }` they actually
read. Neither changes behavior. — 2026-09-05 — agent

**D20 — The forbidden-pattern check is scoped to the §6.5 manifest, and its
baseline allowlist enumerates every current match in that scope — which is more
than §5.1 names.** §5.1 lists the three `as NodeType` casts, "the `as Record<...>`
casts in `simulation.ts`", and the two `nodeDefType.ts` fallbacks. Measured, the
manifest also holds `as Record<` at `edge-types.ts:101`, `nodeDefType.ts:10,:14`
and `storage.ts:71,:96`. The allowlist ships with all of them, because its whole
purpose is that the check does not fail red at Unit 0; the append-forbidden rule
is what makes it a ratchet. `src/types/payload.ts`'s four `as Record<` casts are
**out of scope** — payload normalization is shim/host territory, never part of
the library-to-be. The `Math.random()` rule is scoped to `src/graph/` exactly as
§5.1 words it, and Unit 0c empties it. — 2026-09-05 — agent

**D21 — Gate 6's baseline is 11 import-boundary violations, not 0.** §3.1 phrases
Gate 6 as an absolute prohibition and then says it ratchets like Gate 4; measured
at kickoff the manifest already holds 11 forbidden import edges (`build.ts` ×2,
`groups.ts` ×1, `useGraphModel.ts` ×2, `GraphView.tsx` ×4, `FilterBar.tsx` ×2).
The gate therefore ships as a ratchet with a committed ceiling of 11, reaching
its stated 0 at Unit 8. `PROGRESS.md` records it as a counter beside Counter C.
— 2026-09-05 — agent

**D22 — `ci.yml`'s pull-request trigger gains the feature branch.** CI runs only
on PRs targeting `main`; every unit PR targets `visualizer/composable-dimensions`
(§7.1), so wiring six gates into `ci.yml` would have left them un-run for the
entire run. The trigger list gains `visualizer/**`. §8.2 flag-and-proceed —
repository plumbing, reversible, no behavior change to the product.
— 2026-09-05 — agent

**D23 — A third golden file, `static.golden.json`, carries the
fixture-independent Tier A rows that are not the edge table.** §3.1.1's layout
names one file per fixture plus `edge-types.golden.json` for Tier C, but the
"generated CSS" Tier A row is fixture-independent and belongs in neither: dumping
it into all five fixture goldens duplicates it five ways, and folding it into
`edge-types.golden.json` misnames that file. — 2026-09-05 — agent

**D24 — Tier B goldens only what is platform-stable; the two positional
invariants are measured and reported, not compared.** `VERIFICATION.md` §3.1.1
lists four Tier B assertions. Measured at baseline, two of them do not hold and
one of those cannot hold by construction:

- **Invariant 1 (no NaN): holds** on all five fixtures. Goldened as a boolean.
- **Invariant 2 (`bandCenters().length` = distinct values present): holds.**
  Goldened, and it is structural — no coordinate reaches it, so it is exact on
  every platform. Self-tested: keying the collection by node identity instead of
  the interned type turns it red on all five fixtures (4 -> 37, 7 -> 74), which
  is T1's silent degeneration reproduced on demand.
- **Invariant 3 (every node inside its band ± 5%): does NOT hold.** 2/37, 20/37,
  17/37, 3/53 and 33/74 nodes sit outside. This is not a defect: band gravity is
  a soft spring (gy 0.145, exp 1) and the layout is deliberately charge-dominant,
  so equilibrium is outside the band by design.
- **Invariant 4 (mean speed < alphaMin × 10 after 400 ticks): does NOT hold, and
  structurally cannot.** `tick()` returns early once `alpha < alphaMin`, which
  happens at tick 200 (alpha 1.0, alphaDecay 0.005) — *before* the velocity decay
  runs. Stored `vx`/`vy` are therefore frozen at their last active value and
  never decay to zero, so the measured 2.8e-3…2.9e-2 can only meet a 1e-3
  threshold by coincidence. The simulation genuinely is at rest: it displaces
  nothing after tick 200.

The tolerance is **not** widened — that is §3.3 cheat 1 and it stays at 5%. What
changes is what the *golden file* carries. Tier B's own stated rationale is that
positions are not bit-stable across platforms, and 200 active ticks of an O(n²)
force loop amplify one ULP into a different layout; a count of position-derived
predicates is a position measurement, so goldening `nodesOutsideBand` would
build a gate that goes red on CI for the wrong reason. The golden therefore
carries only structural facts (`bandCenterEntries`, `distinctTypesPresent`,
`distinctCenterValues`, `activeNodeCount`, `ticksToStable`) and
order-of-magnitude booleans (`allFinite`, `boundedPositions`,
`nonDegenerateExtent`). `ticksToStable` replaces the speed threshold as the
settle assertion: cooling is pure arithmetic on alpha, so it is exact
everywhere, and 200 on every fixture is a real regression detector.
`nodesOutsideBand` and the mean speed at rest are computed on every run and
printed as `[tier-b]` diagnostics on stderr. — 2026-09-05 — agent

**D25 — Unit 0's commits 0e and 0f land as one commit.** `PLAN.md` §6.2 lists
the harness and the goldens separately, but a harness commit with no committed
goldens fails Gate 3 by construction, and §7.1 requires every non-WIP commit to
pass Gates 1-5 on its own. Recorded as a §6.3 re-cut; coverage is unchanged.
— 2026-09-05 — agent

**D26 — The Tier B goldens were regenerated to add layout-sensitive rows.**
Supersedes the goldening half of D24 (its analysis of invariants 3 and 4 stands;
its conclusion that no positional value should be goldened does not). Rows
expected to move, and the only rows that moved: every fixture golden gains
`tierB.seededPositions`, `tierB.seedAt` and `tierB.afterShortRun` (four force
configurations), and `static.golden.json` gains `defaultForceParams`,
`defaultNodeScale`, `forceProbes` and `syntheticVisible`. No pre-existing row
changed value — Tier A and Tier C are byte-identical, which is the check that
this was an addition and not a rewrite. — The PR-scope review demonstrated that
no goldened value depended on a position, a force parameter or the seeded RNG,
so deleting a whole force kernel passed every gate; Units 4, 5a and 5b rewrite
exactly that code. — 2026-09-05 — agent

**D27 — The manifest globber matches more extensions than `PLAN.md` §6.5's
globs literally name.** §6.5 writes `src/graph/**.ts`,
`src/components/graph-view/**.ts`, `src/components/controls/**.tsx`,
`src/filter/**.ts`; the globber accepts `.ts`, `.tsx` and `.css` in all four. —
A `.tsx` under `graph-view/`, a `.ts` under `controls/` or a stylesheet beside
either would otherwise sit inside the library-to-be while being invisible to all
three ratchets *and* absent from Unit 8's move list. Reading an [immutable] floor
more strictly cannot violate it; leaving a hole in it can. The count is unchanged
today (no such file exists), so this is protective, not a re-baseline. The gates
additionally print the blind spots they cannot close — unmatched files inside a
globbed directory, and components beside the named ones — so manifest drift is
visible rather than silent. — 2026-09-05 — agent

**D28 — Two patterns added to the forbidden-pattern check (§8.2).**
`as-unknown-as`, because a double assertion is how a cast that stops compiling
gets forced through once the `as NodeType` casts are deleted; and `math-random`
now matches the NAME rather than a call, so a bound or aliased reference cannot
slip past. Both baselines are allowlisted at their measured counts
(`storage.ts` 1, `rng.ts` 2 — the injected default and the comment explaining
it), which keeps the one legitimate reference visible instead of hidden behind a
syntax the rule could not see. The `silent-domain-fallback` rule also accepts
double-quoted literals. — 2026-09-05 — agent

**D29 — Supersedes D16 on fan-out size; the §3.2 contract and the choice of
mechanism are unchanged.** D16's mechanism selection stands: commit-scope reviews
are single fresh sub-agents, PR-scope review is an orchestrated (a)+(b) fan-out,
(c) runs at Units 4/6/8, (d) per unit with B-rows, (e) at Unit 9. What changes is
the *size* of each, and it changes because Unit 0's was measured rather than
guessed: 51 agents and 6.24M subagent tokens returned 34 confirmed findings that
collapse to **4 distinct defects**, with nine of eleven lenses independently
finding the same central one.

The spend was worth it — the harness goldened nothing dependent on the layout,
and that would have survived until Unit 5a or 6 with four units of physics work
already layered on it. But almost none of the cost went to the finding:

  - ~7x redundancy across finders, because convergent lenses re-buy one finding
  - all ~40 verifiers received the full "read these five documents" preamble,
    which is where most of the 6.24M went; a verifier needs the claim and the
    file it anchors to
  - `opts.model` and `opts.effort` were never used, so bounded confirmation work
    ran on the strongest tier
  - 144k tokens reviewed a 13-line Makefile commit and returned three minors
  - 80k tokens authored a 13-line diff, left a stray build artifact, and was
    reviewed anyway

The operative rules live in `VERIFICATION.md` §3.5.5 and are restated as
`PROGRESS.md` SI-1 so they are re-read at every unit boundary. The one thing not
economised: the first review of Units 4, 5a, 5b and 6. Unit 0 is the argument for
that carve-out — the defect was *in the verifier*, and the author could not see it
because the author had written the rationale for it. — 2026-09-06 — human + agent

**D30 — Unit 1 adds golden rows without changing any.** `PLAN.md` Unit 1 says
`**Goldens:** byte-identical. This unit changes no behavior at all.` — which
holds for every row that existed. What is added: `static.forceProbes.absentValue`,
three probes that drive a key the param maps do not declare through the charge
and band kernels. Rows expected to move: that one subtree, and nothing else. Tier
A, Tier C and every fixture's Tier B are byte-identical, which is the check that
this is an addition rather than a rewrite. — The unit's own job is the defaulting
accessors that B5/T3 assign to it, and §3.4 says a fix without a check is a
fix-shaped diff. Verified the check works by removing the three defaults: the
harness throws outright and emits no snapshot, because the band accessor
dereferences `undefined` — exactly the failure T3 describes. — 2026-09-06 — agent

**D31 — The absent-value fallback physics is NOT inert, and that is now stated
rather than claimed otherwise.** `ABSENT_VALUE_PHYSICS` was introduced in Unit 1c
with a comment saying an unrecognized value would "sit still and be noticed, not
push the layout around". The Unit 1 review demonstrated that false in three
independent ways: the charge model couples a pair by the *average* of the two
charges, so a zero still repels every neighbour at half that neighbour's charge
(9 of 9 probe nodes measurably perturbed); and a point band on the origin
contributes a centre to `bandCenters`, moving the median the whole stack is
re-centred on (2 of 9 perturbed, a uniform -2.9 shift).

Taking: **correct the claim, golden the effect, defer the policy.** The guard's
real job — keeping an undeclared value finite and bounded, instead of the NaN or
the hard throw that preceded it — is done and is what Unit 1 was assigned (B5,
T3). Making absent values true *non-participants* is a change to the force model
itself: it needs the accessors to signal absence, `applyChargeForce` to skip a
pair, and `bandCenters` to omit a contribution — which would also put Tier B
invariant 2's "entries equals distinct values present" into question. That is
push/pull work and belongs with Unit 4 (B7, B26), not in a unit whose contract is
"changes no behavior at all". The probe now records **every** node's velocity, so
the trade is pinned and cannot drift silently. — 2026-09-06 — agent

**D32 — Unit 1's review fixes change `static.golden.json` only.** Rows expected
to move, and the only ones that did (224 insertions, 12 deletions, one file):

  - `static.ontologyProbes` — new.
  - `static.forceProbes.absentValue.*` — each run's `unknownVelocity` (3 rows,
    the 12 deleted lines) is **replaced** by `velocities` for every node, and a
    fourth run `undeclaredEdgeCategory` is added. Not purely additive, and
    deliberately so: recording only the unknown node's own velocity was the
    defect the review found — it made the guard's stated property uncheckable —
    so the narrower field is removed rather than kept beside the wider one.

All six fixture goldens and `edge-types` are byte-identical, verified by running
`npm run verify` before regenerating: it reported those six `ok` and only
`static` differing. — 2026-09-06 — agent

**D33 — Unit 2's commit order is reversed: decouple first, move last.**
`PLAN.md` §6.2 opens Unit 2 with two pure-move commits; they cannot be first
without a red Gate 6. The four files 2a moves are still imported from inside the
§6.5 manifest, and `src/adapter/` is a forbidden import target — measured, moving
them first takes Gate 6 from 11 violations to about 16, so the unit's own first
commit could not close. §5.2.5 ("move files only once they are already clean")
points the same way and outranks the commit list, which §6.2 itself calls "the
starting decomposition, not a contract". Coverage is unchanged and the move is
still its own commit, so `git` still records renames — it is simply the last
commit rather than the first. Recorded in `PLAN.md` §6.2 under the Unit 2 entry.
— 2026-09-06 — agent

**D34 — Unit 2's golden contract, stated up front.** `PLAN.md` Unit 2 says
`**Goldens:** byte-identical`, and OQ1/D17 already recorded that this cannot hold:
the unit's whole purpose is replacing `GraphNode.nodeType` with a dimension map,
and the Tier A node rows record a node's identity. The contract for this unit is
therefore:

  - **Tier A node rows change shape**, once, from `"nodeType": "<value>"` to a
    `"dimensions"` map. Every other field on those rows — id, name, orphan,
    definitionKey, parentId, sourceFile, templateParams — stays byte-identical,
    and the *values* inside the new map must be the old `nodeType` strings.
  - **Tier C is byte-identical.** The edge classifier's resolved ids do not move,
    which is the acceptance test for the registries inverting without changing
    what they resolve to.
  - **Every visible-subgraph row is byte-identical.** The resolved sets are what
    a user sees; if a dimension-keyed predicate resolves a different set than a
    type-keyed one did, the generalization is wrong.
  - **Tier B position rows are byte-identical.** The physics keys on a dimension
    value instead of a type string, and the value is the same string, so no
    force may move a node differently.
  - New probe subtrees are additive and named per commit.

Anything outside that list moving is a defect, not a shape change. Each `--write`
in this unit cites this entry. — 2026-09-06 — agent

**D35 — Supersedes D34's node-row clause, and records what removing the
denormalized endpoint types found.** Two corrections to D34's prediction:

1. **`sourceFile` leaves the node row too, and belongs inside the map.** D34 said
   it would stay byte-identical beside a new `dimensions` field. It should not:
   the source file *is* one of the two axes this domain projects onto, so keeping
   it as a sibling field would have been the dual-read C5 forbids. The node row's
   change is therefore `nodeType` + `sourceFile` → `dimensions`, and the values
   inside the map are the two strings the two fields held. Measured across all
   five fixtures: **exactly** those three per-node differences and nothing else.

2. **The synthetic visible-graph golden changed value, and the change is a fix.**
   Three graduated-edge rows in `static.syntheticVisible` reclassify — `act -> wk`
   moves from `linkWorkerToWorkflow` to `linkWorkerToActivity`. The cause is the
   thing B14 exists to remove: that hand-written edge declared
   `sourceId: 'act'` alongside `sourceNodeType: 'workflow'`, so the denormalized
   copy disagreed with the node it described. Nothing could see the disagreement
   while the classifier trusted the copy. Now that endpoints resolve from the
   nodes, the classifier gets it right.

   Worth stating plainly: **the drift was in the harness, not in production.**
   `buildGraph` always wrote the denormalized types from the endpoint nodes, so
   the four fixture goldens show no value change at all — only the row shape
   moves. The one place the two sources of truth had actually diverged was a
   fixture I hand-wrote in Unit 0, and it sat there undetected until the second
   source was deleted. That is the argument for B14 in one example.
— 2026-09-06 — agent

**D36 — The unit PRs stack: each targets its predecessor's branch, and the stack
merges with merge commits, never squashes.** §7.1's "Branches and PRs" had every
unit PR target `visualizer/composable-dimensions`. That is correct for Unit 0 and
wrong for everything above it: a PR based on the feature branch shows its own diff
*plus every predecessor's*. Unit 0 lands ~34k lines of fixtures and goldens, so
Unit 1's PR page opened with roughly 27k lines of JSON it never touched — the
eight largest files in its diff were all Unit 0's — and Unit 2's would have been
worse. Measured on the retarget of #159:

| unit | vs feature branch | vs predecessor |
|---|---|---|
| 0 | 52 files, +34,466 | *(same — bottom of the stack)* |
| 1 | 68 files, +35,482 | **29 files, +1,054/-107** |
| 2 | 79 files | **35 files** |

Same work, either way. Only the right-hand column is reviewable, and the
left-hand one degrades linearly with stack depth.

Three things make this safe rather than clever, all verified before the change:

1. **CI still fires.** D22 had already widened `ci.yml`'s `pull_request` trigger
   to `[main, "visualizer/**"]`, and unit branches match that glob. Had the
   trigger still been the original `[main]`-plus-feature-branch list, retargeting
   would have silently disabled all six gates on every PR above Unit 0 — the exact
   silent-failure shape this document set exists to catch. It was checked first.
2. **The green checks stay valid.** Each unit branches off its predecessor's tip
   exactly (`merge-base(u0,u1) == u0` and `merge-base(u1,u2) == u1`, both
   confirmed), so merging a unit into its predecessor is a fast-forward and the
   tree CI validated is the tree that lands. Note that a base change fires the
   `edited` activity type, which is not in the default trigger set — so retargeting
   does *not* re-run CI, and the pre-existing run is the one that counts.
3. **Merge commits are available.** `allow_merge_commit=true`.

The squash prohibition is the live trap: `allow_squash_merge` is also `true`, and
squash-merging Unit *n* rewrites its commits, which resets Unit *n+1*'s merge base
to the pre-Unit-*n* point and re-inflates its diff to the full cumulative size.
The content would still merge cleanly — it would just become unreviewable again,
for a reason nobody would connect to the merge button they pressed weeks earlier.

The consequence worth naming: **nothing has to merge for the run to proceed.**
The stack can grow to Unit 9 unattended, which is what was actually wanted; merge
authority stays unassumed and unneeded. The cost is that a defect attributable to
an early unit is found against a later unit's diff and gets fixed forward there,
which is already the policy the defect table encodes — so this trades a merge
gate the run never had for a stack depth the review scope already tolerates.

Taken on direct user instruction, which overrides §7's `[immutable]` marker;
logged here because §7.4 requires it. — 2026-09-06 — agent

**D37 — B18 is a deletion, and it moves 22 lines of the static golden.**
`nodeDefType.ts` bridged the two type vocabularies with two module-load maps and
two silent fallbacks — `?? 'workflowDef'` and `?? 'workflow'` — so an
unrecognized input resolved to a *real* type and an unknown node was filtered
and focused as though it were a workflow (T19). The plan has B18 rewrite the
bijection. It turned out not to need rewriting: **nothing has called it since
Unit 2c**, which deleted `GraphNode.nodeType` and with it the last call sites.

*Corrected 2026-09-06:* this entry and commit `d02e1e0` both said "the last two
call sites". It was **five**, across `GraphView.tsx` (three), `useVisibleGraph`
and one more — counted from the commit rather than from memory. The conclusion is
unchanged and the correction is small, but the number was stated as a fact and
was wrong, which is the kind of thing that gets quoted later. Every consumer now reads `ontology.resolveNodeStyle(node).defType`, which
answers a miss with the declared neutral style and warns once — the loud path
Unit 1 built. So the module is deleted rather than ported (C5).

Worth recording how it survived: the module was dead for three commits and no
gate said so, because `static-golden.ts` still imported it and still goldened
its output. **The golden was the only thing keeping it alive, and a passing
golden row reads as evidence that the code under it matters.** A dead-export
check would have caught this; the leak gate counts vocabulary and the boundary
gate counts direction, and neither counts *readers*. Logged as F15.

The golden change (§8.2), line by line — `static.golden.json` 2190 → 2168:

- `defTypeBridge.nodeTypeToDefType` — 8 rows, one per node type. Deleted: the
  function is gone.
- `defTypeBridge.defTypeToNodeType` — 8 rows. Deleted, same reason.
- `defTypeBridge.unmappedFallbacks` — 4 lines pinning the two silent defaults.
  Deleted: this is the behaviour B18 exists to remove, and it is the one row
  whose disappearance is the point rather than a side effect.
- `defTypeBridge` → `filterChipLayer` — the key is renamed and, being
  alphabetically later, moves down within the canonically-sorted object. Its
  `filterChips` rows are **unchanged in value**; they are kept deliberately,
  because the chip folding is the half of T19 that is still live: five chips
  cover seven filter keys and one chip carries three of them.

No other golden moves. The four fixture goldens and the edge-type table are
byte-identical, which is the check that this touched a harness-only path and not
the engine. — 2026-09-06 — agent

**D38 — OQ2 resolved: §6.5's ceilings table is the gate, §6.2's per-unit line is
the target.** `PLAN.md` states two different leak ceilings per unit and they
agree only at Units 0, 1, 7 and 8; Unit 2 reads **210** in §6.5's table and
**150** in §6.2's line. §6.1 gate 4 cites "the unit's ceiling (§6.5)", so the
table binds the gate and the tighter number steers the work. This is the
resolution OQ2 said it would take, decided at the Unit 2 boundary as planned.
— 2026-09-06 — agent

**D39 — Keyed lookups on a dimension value must use `hasOwn`; the static golden
gains a `prototypeNamedValues` block.** Dimension values are host-supplied
strings, and three lookups read them as plain object indexes: `forces.ts`'s
`lookup` and `bandForKey`, and `ontology.ts`'s `styleForKey`. A value named
`constructor`, `__proto__`, `toString`, `hasOwnProperty` or `valueOf` therefore
resolved up the prototype chain to an inherited member — which is not
`undefined`, so every `?? ABSENT_VALUE_PHYSICS.x` and `!== undefined` guard
downstream accepted it as a declared value.

Neither consequence stays local, which is why this is not a curiosity:

- The `Object` function enters the force arithmetic as NaN, and because charge
  couples a pair by the *average* of the two endpoints' charges, and a band
  contributes its centre to the median the stack re-centres on, one such node
  takes the whole layout non-finite. Reproduced: all ten probe nodes went
  non-finite in the charge and radial-band kernels. `bandCartesian` survived,
  so the corruption is kernel-dependent — harder to spot, not easier.
- `ontology.ts`'s header promises "resolution never throws". With
  `key = 'constructor'` the miss went undetected and `styleForKey` returned the
  `Object` constructor as a `NodeTypeDefinition`; the first consumer to read
  `.size.r` off it throws, inside the draw loop, which is the exact failure the
  required-fallback design exists to prevent (T4).

Fixed with one shared `hasOwn` in `dimension.ts`, called on `Object.prototype`
rather than on the table so a table declaring its own `hasOwnProperty` cannot
shadow the check, and spelled `Object.prototype.hasOwnProperty.call` rather than
`Object.hasOwn` so it needs no `lib` bump (target is ES2020).

**Golden change (§8.2):** `static.golden.json` gains one
`ontologyProbes.prototypeNamedValues` block — five rows, one per prototype
member name, each recording that the style resolves to the declared fallback and
that charge / coreRadius / band give the absent-value answers. No existing row
moves. The block is worth its lines because nothing else in the harness passes a
value the taxonomy does not declare *and that also names a prototype member*;
the existing `notADeclaredKey` probe misses it by construction, since an ordinary
unknown string does resolve to `undefined`.

Found by the Unit 2 review fan-out (lens: physics). — 2026-09-06 — agent

**D40 — `src/adapter/` created a hole in the accounting; a flat `totalCeiling`
and a transitive Gate 6 close it.** Unit 2's review measured the unit's own
headline honestly for the first time, and it does not say what the number said.

**The leak drop was 82% relocation, and the relocated vocabulary grew.** Joining
the per-file gate tables across `ffb2ef8..21c4504`: of the 374-occurrence fall,
308 is files moving to `src/adapter/`, 65 is genuine in-place removal, 2 is
outright deletion, +1 new. And counted at the destination with the gate's own
pattern, those five files hold **330** occurrences where they held 308 before —
so the run's real total *rose by 22* behind a reported drop of 308. Gate 6's
`11 -> 8` is 100% relocation: no import edge was removed this unit, and one new
one (`GraphView -> adapter/useGraphModel`) was added.

None of that makes the unit wrong — moving domain entries to the host half is
precisely what Unit 2 is for. What is wrong is that **no gate could tell the
difference between that and parking a file in `src/adapter/` to duck the count.**
Demonstrated three ways by the review, each reproduced: relocating
`src/filter/storage.ts` byte-identically and deleting its allowlist entries
improves all three ratchets with nothing deleted; appending 1000 domain terms to
`src/adapter/node-types.ts` moves no gate by a single unit; and a two-line
re-export barrel lets a manifest file import the registry with both gates green.

Three changes:

1. **`shimFiles()`** in `manifest.mjs` — the complement of the manifest, defined
   as Gate 6's own FORBIDDEN trees so "the shim" means one thing to every gate.
2. **`totalCeiling` = manifest + shim, ratcheted FLAT** (1276 at Unit 2 close:
   209 + 1067). Not ratcheted *down*, because the shim is allowed its domain —
   that is what a shim is for. Flat is enough: relocation keeps the total
   unchanged and therefore stops reading as progress, while relocation that adds
   vocabulary now fails. Verified both: the `storage.ts` move takes the leak
   count 209 -> 204 with the total pinned at 1276, and six words appended to an
   adapter file take it to 1282 and FAIL.
3. **Gate 6 resolves re-exports transitively** — following `export … from` but
   not plain `import`, since only the first hands a dependency to a consumer —
   and prints the route (`-> ../types/registry-barrel -> ../adapter/node-types`).
   Verified: the barrel cheat goes from green to `boundary violations: 9
   (ceiling 8)`, with no false positive on the existing eight.

`PLAN.md` §6.5's claim that the paired gates catch the barrel is corrected in
place rather than quietly dropped, because it is the sentence that says the two
gates cover each other, and it was false in both halves. The honest statement is
that Gate 4 covers vocabulary *spelled out*, and vocabulary laundered behind
neutral symbol names (`NODE_TYPE_REGISTRY`) is Gate 6's job alone.

Found by the Unit 2 review fan-out (lenses: counters, cheats). — 2026-09-06 — agent

**D41 — `useGraphModel` moved to the adapter with §6.3's precondition knowingly
unmet; the closure moves to Unit 8.** §6.2's Unit 2e line reads "the
now-Temporal-only files into `src/adapter/`, **once nothing in the manifest
imports them**." For four of the five movers that held. For `useGraphModel.ts` it
did not, and still does not: `GraphView.tsx:34` imports it across the boundary,
which is one of Gate 6's eight remaining violations. The review demonstrated the
coupling is real rather than notional — deleting the file takes `tsc` to exit 2
with exactly one error, and that error is inside the manifest.

I recorded the three options in `PROGRESS.md` before making the move and took
(a). What I did not do, and should have, was say plainly that (a) **violates a
stated precondition** rather than merely trading against a ceiling. Recording it
now, because a precondition that gets quietly reinterpreted the first time it is
inconvenient is not a precondition.

The reasoning stands on its merits: `useGraphModel`'s whole job is
parser-payload → model, and two of Gate 6's original eleven violations were its
own imports of `types/ast` and `types/parser-graph` — the file was already
adapter code sitting in the manifest by glob accident. Moving it took the gate
from 11 to 8, a decrease the ratchet allows. The alternative, `GraphView` taking
`graph`/`allFiles`/`errors`/`diagnostics` as props, is the correct end state and
is §6.2's Unit 8 ("the move + packaging").

What changes as a result: the D40 total ceiling means this relocation no longer
*counts* as vocabulary progress, which removes the incentive that made (a)
attractive. And Unit 8's checklist gains an explicit item — **close
`GraphView -> adapter/useGraphModel`, the last manifest→shim edge that a props
change removes** — so the deviation is carried as debt with a named owner rather
than absorbed.

Found by the Unit 2 review fan-out (lens: counters). — 2026-09-06 — agent

**D42 — The seam probe grows a physics half, and the style axis stops existing
twice.** Two findings, one cause: the injection argument was only ever being made
for one consumer.

`ontology-probes.ts` drove `computeVisibleGraph` through two taxonomies and
goldened that the answers differ — real coverage, but of styling and filtering
only. The review pinned `Simulation` to the first ontology it ever saw, and
separately pinned `resolveEdgeType`, and **every gate stayed green** both times,
with a control proving the same sabotage inside `computeVisibleGraph` does turn
the golden red. So `defaultParamsFor`'s axis and key-space derivation and the
link force's spring resolution were asserted by nothing.

New `ontologyProbes.physicsInjection` rows drive a taxonomy on a *different axis*
(`zone`, values `north`/`south`) and record: the axis comes from the container;
the charge map's key space comes from the container; a node on that axis scores
under its own taxonomy and is absent under the shipped one. The last pair is the
part that makes it a real test — one row alone would pass for a probe that simply
consulted the shipped taxonomy twice. It also keeps a *negative* row: the
existing `ALTERNATE` restyles the shipped axis, so its physics must AGREE with
the shipped taxonomy's, and a probe that reported a difference for every
alternate would prove nothing.

`Ontology.styleDimension` became `styleAxis()`. The axis was stored twice — a
data field and a value closed over by `valueFor`/`resolveNodeStyle` — so a
container derived by spreading rewrote only the field and left the closures on
the old axis. Consumers then split on which half they read: `defaultParamsFor`
took the field, the draw loop took the closure. Reproduced: a derived ontology
returned the original styles while its physics keyed on an axis with no matching
entries, every lookup falling through to the absent-value defaults — charge 0
against a real -770, i.e. a collapsed layout with no error. A method has one
source, so there is nothing left to override out of step, and a row now goldens
that a spread-derived container stays self-consistent.

`resolveEdgeType` is passed as a bare function reference in three places, so
`this`-based methods were not an option; `styleAxis` closes over its value and is
safe detached.

Found by the Unit 2 review fan-out (lens: seam). — 2026-09-06 — agent

**D43 — The filter model becomes axis-keyed, and the static golden's
`filterSetIdentity` rows flip because they had pinned a real defect.**
`FilterState` and `PinState` become `Record<DimensionId, …>`; the reconciler and
the chip toggles loop over axes reading per-axis policy from descriptors (T7, T8,
T9) instead of branching on two names.

**The golden change is the interesting part.** `filterSetIdentity` recorded
`filesIdentityChanged: true` for a manual reconcile — and that was not a
description of correct behaviour, it was the T5 defect frozen in place. The old
`reconcileManual` cloned the whole filter and then reassigned the unpinned axes,
so **every** axis came back with a fresh `Set`, including pinned ones and
including axes whose content had not changed. `useSimulationLoop` decides "did
this axis change?" with `prev === next`, so any manual view switch that altered
one axis also fired the *other* axis's change path. For the type axis that path
is an ancestor-seed, `reheat(0.5)`, and `initialFitDone = false` — i.e. **the
user's pan and zoom were silently discarded on a view switch that changed only
the file selection.**

`withSelection` is copy-on-write and returns the state object itself when the
content is unchanged, so the rows now read `false`. Nothing about the *resolved
visible set* moves; this is identity, which is what T5 is about.

Second change in the same section: `overriddenPins` values are dimension ids
(`defType`, `sourceFile`) rather than the old `types` / `files` labels, because
pins are now keyed by axis.

Measured, after repairing the probe (below): **exactly one row flips** —
`reconcile(manual, unpinned)`, `filesIdentityChanged: true -> false`. Every
toggle row is unchanged, which is the control: a toggle *should* change its own
axis's identity and must not touch the other's.

**Three harness bugs found while making this change, all the same shape**, and
the shape is the one this whole unit is about: a string-keyed record accepts any
key, so the type system cannot tell a real axis id from a stale field name.

- `PIN_STATES` kept building `{files, types}` — pins on axes that do not exist,
  so every real pin read false and the reconcile matrix collapsed to its unpinned
  rows.
- `filterOf` kept building `{selectedFiles, visibleTypes}` — every fixture
  selection empty.
- Worst: the identity probe still compared `next.selectedFiles !== current.selectedFiles`.
  Both sides are now `undefined`, `undefined !== undefined` is `false`, so **every
  row reported `false`** — and the first golden I wrote for this change therefore
  asserted the T5 fix while measuring nothing at all. The fix was real *and* the
  probe was blind: two halves, each individually plausible (F12, STANDING_CHECKS
  #1), in the one place designed to catch exactly that.

The first two were caught only because the golden shrank by 186 lines. The third
was caught only because 9 of 10 rows flipping in the same direction was too
uniform to be a real behaviour change. Neither is a type error, and neither would
have been caught by a gate. Comparisons in the probe now go through
`selectionFor`, so a stale name is a compile error rather than a silent `undefined`.

— 2026-09-06 — agent

**D44 — Removing an axis from the chain unfilters it, and "unfiltered" is
`emptyMeans`-dependent.** The chain (R17-R19) is which axes a view *displays*.
Two questions fall out of that, and the first answer was wrong.

**Does removing an axis stop it filtering?** Yes. Leaving the selection in place
would filter the view by something with no on-screen representation and no way to
reach it — invisible state that reads as a bug, and R17 calls the affordance
"delete", which has to mean the filtering stops.

**What is "not filtering" on an axis?** *Not* an empty selection, and this is
where the first implementation was wrong: I cleared the selection, which is
correct for the file axis (`emptyMeans: 'all'`, empty matches everything) and
**blanks the view** on the kind axis (`emptyMeans: 'none'`, empty matches
nothing). Match-everything is therefore the empty set for one axis and the full
value set for the other — T7's asymmetry showing up in a third place, after the
predicate and the focus policy.

Verified in the browser: removing the Kind filter on `nexus-sample` takes the
graph 13/60 -> **37/60**, i.e. it unfilters rather than blanking, and the `+`
restores the chips with the selection intact.

**The chain default is the host's declared order** (R19). `filterDimensions`
order *is* the chain, so "default displayed filters" is configurable by declaring
a different taxonomy rather than by adding a setting. That also made the
declaration order load-bearing: the first build put kinds before files and
silently reordered the shipped bar, which the browser caught. The order is now
documented as meaningful where it is declared.

— 2026-09-06 — agent

**D45 — Unit 3 misses §6.5's ceiling of 195, landing at 203. §8.2 flag with the
arithmetic, not a silent reset.** §6.5 says "a missed ceiling is a §8.2 flag with
the new number and the reason", so here is the reason, checked against §6.5's own
baseline table rather than asserted.

Every file the table assigns to Unit 3:

| file | baseline | now | |
|---|---:|---:|---|
| `filter/storage.ts` | 5 | **0** | taken this unit |
| `filter/reconcile.ts` | 1 | **0** | taken this unit |
| `graph-view/useGraphModel.ts` | 3 | — | left the manifest in Unit 2e |
| `components/FilterBar.tsx` | 3 | **2** | 1 cleared in 3d when chips stopped coming from the theme; the 2 that remain are the `TWFFile` AST type it takes as a prop, which Unit 7 removes with the rest of its domain coupling |

*Corrected 2026-09-06:* the FilterBar row above originally read 0. I asserted it
without measuring — `grep`ing the gate output for the other three filenames and
inferring the fourth. It is 2. The conclusion below is unchanged (both remaining
occurrences are `TWFFile`, which is Unit 7's), but "assumed, not measured" is the
habit this run keeps punishing.

So Unit 3's assigned total is 12, of which **6 had already been taken during Unit
2** — `useGraphModel` moved to the adapter, and `FilterBar`'s three went when the
chip grouping became descriptor-declared. Those 6 were therefore already inside
Unit 2's reported 209. The 15-point drop §6.5 projects for Unit 3 double-counts
them; the reachable drop from 209 was 6, and all 6 were taken. 209 → 203.

The remaining 203 is assigned by the same table to other units: `edge-styles.ts`
58 and `FilterBar.css` 39 to Unit 6, `GraphView.tsx` 30 + `visibleGraph.ts` 19 +
`useHighlight.ts` 10 to Unit 7, `model.ts` 12 to Unit 4. **None of it is Unit 3's
to remove**, and removing any of it here would be doing another unit's work
inside a unit scoped to filters.

Ceilings ratcheted to the measured values: leak **204**, total **1266**, boundary
**7**. The boundary drop is real rather than relocation — `FilterBar` stopped
importing the theme entirely, which is the first genuine edge removal of the run
(Unit 2's 11 → 8 was 100% relocation).

Unit 4's §6.5 ceiling is 160. From 203 that needs 43, against `model.ts`'s 12 —
so the same double-count likely repeats. Worth re-deriving Unit 4's number from
the table at its boundary rather than treating 160 as reachable.

— 2026-09-06 — agent

**D46 — The reheat policy gets a gate, and the prototype probe stops dropping its
own worst row.** Both from the Unit 3 review, and both are the same failure: a
check that exists and does not check.

**`DimensionDescriptor.reheat` had no reader any gate could reach.** All four
fields on either axis could be inverted — including `resume: false`, which is
precisely the mistake T9 names and which leaves the canvas frozen after every
toggle — and typecheck, all six gates and 7/7 goldens stayed green. The reviewer
demonstrated it with a control: flipping the sibling field `focus` on the same
descriptor *does* turn the golden red, so the suite is not blind to descriptor
edits in general, only to this one. Declared policy that nothing reads is not
policy; it is a comment with a type.

Fixed by extracting the fold — "several axes moved, what does the simulation
do?" — out of the React hook into `foldReheatPolicy`, a pure function, and
goldening it. The new `ontologyProbes.reheatPolicy` block records each axis's
declared policy and the fold for **every subset of axes**, because a view switch
moves more than one at once and "last one wins" would hide precisely there.

**`prototypeNamedValues` listed five names and recorded four.** The row keys are
the prototype member names being probed, so `rows['__proto__'] = …` on a plain
object set the prototype and stored nothing. The probe silently dropped the row
most likely to catch the bug it exists for — a blind spot inside the instrument
built for blind spots, which is the third time this unit. Now a `Map`.

The same rows gained `abbreviation`, because `Ontology.abbreviationFor` was a
fourth unguarded prototype-chain lookup that D39 missed when it fixed the other
three: `abbreviationFor('constructor')` returned a Function where a string was
expected.

**Golden change (§8.2):** `static.golden.json` gains `ontologyProbes.reheatPolicy`
(two axes' declared policy plus four folds) and two fields per
`prototypeNamedValues` row, and gains the `__proto__` row that was being dropped.
No existing row changes value.

— 2026-09-06 — agent

**D47 — Per-bucket force tuning is one constructed value, and it is sparse.**
The shape fix PLAN §6.6 named and §6.7 sketched, landed as Unit 4's first commit
— before 4e's dimension dropdown exists, because the dropdown moves the axis onto
the same edit channel as `pushMultiplier`, and that is when "axis and table must
agree" stops being a taxonomy-swap-only hazard and becomes one click away.

`ChargeParams.chargeDimension` + `charge` + `coreRadius` become `push:
AxisTuning<PushPhysics>`; `GravityParams.bandDimension` + `band` become `band:
AxisTuning<BandRange>`. An `AxisTuning` is `{ axis, mapping, overrides }`: which
axis, how its values bucket, and **only what the user changed**, keyed by bucket.
Every other bucket resolves to the taxonomy's declared physics at read time.

Four things fall out, and they are why this is the elegant answer rather than a
tidier one:

1. **Nothing is stored twice.** The axis is in one place. The key space is the
   mapping's. The defaults are the taxonomy's. There is no dense copy to go
   stale, so the provenance token `useSimulation` carried in a React ref to detect
   staleness has nothing left to detect — a swap simply yields empty overrides on
   the new axis.
2. **T25 for free.** The kernels are hot (four reads per pair, O(n²)) and the
   tuning is sparse, so `resolvePhysics(params, taxonomy)` produces dense
   per-bucket tables ONCE — in `Simulation`'s constructor and `setParams`, and in
   a `useMemo` on each control surface and the canvas — and the loops read those.
   Resolution is the only place the forces consult the taxonomy, and it never
   runs inside a loop.
3. **"Is this tuned?" is answerable.** Presence in `overrides` is the answer.
   Today a user setting equal to the default is indistinguishable from the
   default; now the UI can mark modified tokens and reset one or all.
4. **T10 holds.** The scalars beside the tuning stay flat, so `keyof ForceParams`,
   `NumericForceKey` and every `SliderDef` are untouched. Only the table fields
   changed shape.

A bucket covering several values (4b's mapped buckets) resolves to the **mean**
of their declared charge and core radius and the **union** of their bands — both
order-independent, so a host reordering a bucket's values for readability moves
nothing. Under the identity mapping every bucket has one value and the fold is
the value, which is why the goldens are value-identical.

`link`/`dist` keep their `EdgeTypeId` keying: they are per edge *category*, not
per axis value, and 4c makes categories dimensional. Changing their shape here
would be doing 4c's work in 4-pre.

**Golden change (§8.2):** `static.defaultForceParams` changes *shape* only —
`charge`/`coreRadius`/`band` records become `push.buckets`/`band.buckets` on the
resolved tables, with `axis` recorded beside each. Every scalar and every
per-bucket number is identical; verified by joining old and new on bucket id.
All four fixture goldens and Tier C byte-identical.

— 2026-10-21 — agent

**D48 — Edges carry `relation` and `dispatch` as dimensions; the endpoint rides
as payload (Unit 4a, R5).** `GraphEdge` was `{ id, edgeType, sourceId, targetId,
nexusEndpoint?, dispatchKind? }` — two of those fields domain-shaped, and the
last one a flag in disguise: `dispatchKind` was carried only when it was
`signalSend`, the one value the spring classifier needed. It is now
`{ id, sourceId, targetId, dimensions, payload? }`, mirroring `GraphNode`.

`relation` ('containment' | 'dependency') and `dispatch` are library-declared
axes, for the same reason the file and kind axes are: the engine ships the code
that reads them. `dispatch` carries the producer's kind **verbatim on every
dependency edge** — open, not an enum — which is what lets 4c resolve springs
from dispatch rather than from endpoint types alone, T14's sixteenth case.
Containment edges dispatch nothing and are absent on that axis; a coarsened edge
is a projection of several dispatches and has no single one.

`nexusEndpoint` is per call site, not identity and not an axis, so it is
host-owned payload. Three library readers (highlight, graduation dedup, edge
style) still read it by key — those are the nexus splice (B16, Unit 7) and the
`edgeStyleFor` unification (T11, Unit 6), and this unit does not pretend to do
their work. The leak count for those three files is unchanged; `model.ts`'s is
what drops, which is Unit 4's one assigned residue.

**Golden change (§8.2).** Tier C is byte-identical — the hard requirement, since
its row keys are the same strings as before. `static` is byte-identical. The
five fixture goldens change in exactly one way: every dependency edge line gains
a `|dispatch=<kind>` suffix it previously had only when the kind was
`signalSend`. Verified shape-agnostically below: stripping that suffix from
every new line reproduces the old golden exactly, so no classification id, style
key, relation, endpoint or count moved.

— 2026-10-21 — agent

**D49 — Springs resolve dimensionally; the shim's table is the style axis's
declared physics (Unit 4c, D2).** `LinkParams.link` / `dist` — two dense
`Record<EdgeTypeId, number>` copied off the taxonomy in `defaultParamsFor` —
become `spring: AxisTuning<SpringPhysics>`, the sparse shape push and band took
in D47. The categories are not stored: `resolvePhysics` derives them from the
mapping. On the style axis bucketed by identity they are the host's `edgeTypes`,
classified by its `resolveEdgeType` rule, verbatim (D2) — the fifteen hand-tuned
springs and the precedence T14 names. On any other (axis, mapping) they are the
library's pair rule: one category per unordered bucket pair per relation
(`relation|a|b`), each `DEFAULT_SPRING` until tuned, so the token count is
`k(k+1)` for `k` buckets and the 24-ceiling is arithmetic (k ≤ 4) rather than a
judgement.

Three things follow:

1. **The host's rule takes values and returns an id.** The library reads the
   axis off the mapping and hands the two endpoint values over, so the shim's
   lambda that read `TEMPORAL_TYPE_DIMENSION` from each node is gone and the
   axis is read in exactly one place. Returning the id rather than the
   definition makes the declared table the single source of physics and
   metadata; `definitionFor`'s loud throw moves into `resolveSprings`, beside the
   table, as a membership check on every classification.
2. **`AxisTuning.axis` is gone.** `DimensionalMapping.dimension` already named
   the axis, so `axis` was one fact stored twice (STANDING_CHECKS #2) with
   `identityTuning` the only thing keeping them equal. Every reader now says
   `mapping.dimension`.
3. **`ABSENT_EDGE_PHYSICS` changes meaning.** It was "an id the param maps do
   not declare", which cannot happen now that the table is derived rather than
   copied. It is "an endpoint the mapping does not bucket", reachable only under
   the pair rule; the host path cannot miss, because its rule's ids are checked
   against its table.

What the pair rule does not do: read `dispatch`. Dispatch is a host-rule input
(the signal-send precedence), and keying generic categories by it would multiply
the token count by the number of dispatch kinds. A mapped axis that wants
dispatch-sensitive springs declares a rule — 4e's host-side surface, if it is
wanted.

**Golden change (§8.2).** Tier A, Tier B and Tier C byte-identical — Tier B is
the acceptance test: every edge resolves to the stiffness and rest length it did,
through the new path. `static` changes in three places. `defaultForceParams.link`
/ `dist` become `spring: { axis, categories }` carrying the same fifteen numbers,
verified by joining old and new on id. `forceProbes.absentValue.undeclaredEdgeCategory`
— whose premise, a resolver id missing from the param maps, no longer exists — is
replaced by `absentValue.link` (the unknown node's edge through the host rule's
catch-all) and `forceProbes.mappedAxisSprings` (the pair rule, the identity gate
from both sides, and an unbucketed endpoint resolving inert).
`ontologyProbes.physicsInjection` gains `springKeys` and `zoneSpring`, pinning
that the table comes from the supplied container. Nothing else in `static` moves.

— 2026-10-21 — agent

**D50 — The kind axis is written by the adapter, not projected by the engine
(Unit 4e-i; settles REVIEW_3's carried item).** `ontology.valueOn` special-cased
`defType`: every other axis was read off the node's dimension map, that one was
computed from the style axis through the taxonomy. The reviewer called it the
domain leaking back under a neutral name; the defence was shared vocabulary.
Unit 4 makes the axis a user choice for layout, and `bucketOf` reads the
dimension map — so a projected axis would have needed the projection a second
time, in the physics. That settles it: a node carries its position on every
axis the host filters or lays out on, and which of those are functions of which
is the host's business. `build.ts` writes `defType` beside `temporalType` and
`sourceFile`; `valueOn` is one indexer for every axis; `NodeTypeDefinition`
loses `defType` (it moves to the shim's `TemporalNodeTypeDefinition`, where its
only readers are); `TEMPORAL_TYPE_DIMENSION` moves to `node-types.ts`, which is
the host half of the taxonomy and now needs no import from the adapter.

The filter bar's kind values come from the graph like the file values do
(`valuesOn`, a library helper the Unit 4e dropdown also needs), through the
`valuesByDimension` prop it already declared for a third axis and nothing
supplied.

What this changes about injection: swapping the taxonomy no longer changes
which nodes a kind filter shows, because the kind is on the node. The
container still decides what the visible set *means* — styling and summaries —
and the probe now says exactly that, with nodes built as the alternate
taxonomy's adapter would build them.

**Golden change (§8.2).** Tier B and Tier C byte-identical. Tier A: every node's
`dimensions` gains `defType` — annotation-only, verified by stripping it and
comparing; `static.syntheticVisible.nodes` gain it the same way. `static`:
`ontologyProbes.fallbackStyle` loses `defType` (an
unrecognized style key no longer decides visibility); `ontologyProbes.injection`
is reworked as above; `derivedBySpreadStaysConsistent.stillResolvesTheSameStyle`
compares by reference, same value. Nothing else moves.

— 2026-10-21 — agent

**D51 — Push and Pull share one tab and one axis; the ceiling is measured, not
estimated (Unit 4e-iii; R13, R22–R25, R34).** The PUSH and PULL tabs become one
PUSH/PULL tab: an axis dropdown at the top, then Push and Pull as sub-tabs in the
Band/Topological style without switches. The sub-tab primitives (`SubTabs`,
`SubTab`, `SubTabBodies`, `SubTabBody`) are shared with Gravity, which used to
own them under `gravity-*` class names; `EquationSection` moves out of the
panel for the same reason. MISC survives untouched (R34).

**The dropdown offers what the graph admits.** `axisOptions(ontology, graph)`
is the style axis bucketed by identity plus every filter axis bucketed by the
values the graph presents on it, each with its measured cost: push tokens are
buckets, pull tokens are the spring categories some edge actually falls in
(`presentSpringCategories`). The 24-token rule (`TOKEN_CEILING`, `fitsCeiling`)
is applied to those numbers — an axis over the ceiling is listed disabled with
the count that disqualified it — rather than to `k(k+1)`, because the pair
rule's *possible* categories are every bucket pair and most are never joined.
The same measurement decides what the spring map shows: **one token per
category present**, on every axis, the declared table included. A declared
category no edge uses (`Wf→Sig` in every fixture) is tunable but not shown;
one rule for both classifiers beat two.

**Switching axes resets the two tunings** to empty overrides on the new mapping
(D47: nothing to reinterpret). **Graph changes retune** (`retunedFor`): an
identity mapping over observed values is rebuilt when the values change, with
the overrides kept — they are keyed by value — and the tuning returned by
reference when nothing moved, so the view can tell. An axis the graph no longer
carries, or that grew past the ceiling, falls back to the style axis.

The relocating-edit channel is renamed `onRelayout`: it carried gravity's mode
and toggles and now carries the axis switch too, and "gravity" was the wrong
name for a channel the push/pull tab uses.

**Golden change (§8.2).** Tier B and Tier C byte-identical; `static`
byte-identical. Tier A gains one row per fixture, `axes`: each axis the fixture
admits with its push/pull token counts, whether it fits, and the spring
categories present under it — the ceiling arithmetic pinned per fixture.
Nothing else moves.

— 2026-10-21 — agent

**D52 — What REVIEW_4 changed in the model (Unit 4 close).** The six-lens
review found the pair forces' axis stored twice and physics off the style axis
resolved through the style table. Both are model defects, and the fixes are
model changes:

1. **One pair axis.** `ChargeParams.push` and `LinkParams.spring` were two
   `AxisTuning`s, each naming an axis, held equal by one handler (c2;
   contradicted D51). They are one `PairTuning { mapping, push, spring }` —
   the axis once, two sparse override maps — on both param slices. Band keeps
   its own `AxisTuning`; 5a gives it its own axis by design.
2. **Typical physics off the style axis.** `declaredPush`/`declaredBand` fold
   the style table over a bucket's values, which off the style axis are files
   or kinds, not style keys: every bucket resolved to the fallback style's
   −300/30 with a false placeholder warning each (c1, a blocker). A bucket on
   any other axis now starts from the host's *typical* declared physics — the
   same fold, over every declared value. Springs likewise: `DEFAULT_SPRING`,
   a constant from no domain, becomes `typicalSpring`, the mean of the host's
   declared springs.
3. **The pair rule enumerates nothing.** `pairCategories` built `k(k+1)`
   categories per axis per graph change — 4M for a 2000-file graph, to
   produce one disabled option (c9) — and its `'|'`/`'-'` encoding let a bucket
   id collide with a separator and counted unbucketed endpoints as phantom
   tokens (c4). `ResolvedSprings` is now three functions — `classify`,
   `physicsFor`, `describe` — a category exists when an edge falls in it, ids
   are JSON triples, and an unbucketed endpoint classifies to `undefined`,
   which is counted nowhere and pulls nothing.
4. **Per-edge classification is cached** (c7, the link half of T25):
   `Simulation` classifies its edges once per resolved physics and hands the
   kernel a lookup. `presentSprings` keys on the mapping, not on `resolved`.
5. **`retunedFor` covers the taxonomy** (c20): the style axis is rebuilt from
   the new taxonomy with overrides kept where values survive, so
   `useSimulation`'s provenance ref is gone and D47's "nothing left to detect"
   is finally true. `sameBuckets` ignores order (c3).
6. **Closed and coherent.** `relationOf` throws on a relation the engine does
   not know (c17); `createOntology` refuses a style value set declared
   differently in any of its four places; `createDimensionalMapping` refuses a
   duplicate bucket id or an empty bucket; `identityMapping` numbers duplicate
   abbreviations (c11, c16). `EdgeTypeDefinition.directional`, read by nothing
   but the harness, is gone (c18). One `AxisNamer` shape serves descriptors and
   the style axis, so there is one identity builder (c16).
7. **Gates for what had none.** `tuning-probes.ts` pins the override channel
   end to end, `retunedFor`'s contract, the ceiling's failing side, the
   foreign-axis physics, the membership throw, the visibility policy under two
   taxonomies, and the refusals above (c3, c15, c6, c13, c14). Tier C
   classifies through the engine, not the shim function (c6). `surface-gate`
   holds `src/lib.ts` to `kickoff/lib-surface.txt` (c19). MAP lists files only
   the harness imports (c24).

**Golden change (§8.2).** Tier B byte-identical; Tier C byte-identical through
the engine path. Tier A: the pair-rule ids in `axes[].presentSprings` change
encoding (`"rel|a|b"` → `["rel","a","b"]`), same set, verified by decoding.
`static`: `edgeTypes` rows lose `directional`; `forceProbes.mappedAxisSprings`
rows are renamed and gain `mappedPush` (the fold, pinned); `forceProbes.nonIdentityParams`
(every scalar off its identity, one non-integer override — c8) and `tuningProbes` are
new; `ontologyProbes.mappings.intersectingBucketsRefused` carries the refusal's
new wording ("is incoherent"), since one message now covers three refusals.
Nothing else moves.

— 2026-10-21 — agent

**D53 — Two symmetric layout axes; bands re-centred and seeded alike; the
overlay draws what acts (Unit 5a-i/ii; T22, T12, T2; closes #90).**

- `GravityParams` carries `bandX` and `bandY`, each an `AxisTuning<BandRange>`
  on its own mapping. Gone: `band` (Y only), `bandXMin`/`bandXMax` (one global
  window), `bandEnabled`, `gravityMode`. A strength of zero is an axis switched
  off (`gravityX`, `gravityY`); `radial: boolean` replaces the mode string —
  Y's bands become rings, X is ignored, topological's focal point moves to the
  centre. `gravityDownstream` is `gravityTopological` (#90): `ForceParams` is
  not in the published surface, which `surface-gate` now proves.
- `NodeTypeDefinition.physics.yBand` is `physics.band: { x, y }`. The shim
  declares every type's `x` as the window it always had (`X_WINDOW`, 0–380),
  so the default horizontal physics is unchanged — measured: on every fixture
  no node reaches the window, the X force never fires, and `gravityX` at 0 or
  ×4 moves nothing.
- One rule on both axes (`pullToBands`): per-bucket bands, re-centred on the
  median of the centres present. X was never re-centred; it is now, so the
  window sits at −190..190 about the origin, which the canvas's fit absorbs.
- Seeding (T2) places a node at the re-centred band centre on both axes, so
  the seed and the force agree. Y used to seed at the *unshifted* centre and
  the first ticks relocated every node by the median — the thing seeding
  exists to prevent, in mild form. A node with no value on an axis has the
  absent band: a point at that axis's centre.
- The band maths lives once (T12): `presentBuckets`, `bandCenters`,
  `medianBandCenter`, `ringRadii` are the engine's and the overlay calls them.
  **Present, not all:** the overlay draws only buckets some visible node falls
  in, on both axes and in both modes — the set the force re-centres on and
  rings. A stripe for a bucket with no visible node was decoration that misled
  about the median. Buckets sharing a band draw one stripe.
- `YBand { yMin, yMax }` is gone; `bandForKey` and `bandFor` return `BandRange`.

**Golden change (§8.2).** Tier A and Tier C byte-identical. `static`:
`nodeTypes[].physics.yBand` → `band.{x,y}`; `defaultForceParams.band` →
`bandX` and `bandY`, and its scalars follow the params (`bandEnabled`,
`bandXMin`, `bandXMax`, `gravityMode`, `gravityDownstream` gone; `radial`,
`gravityTopological` added); probe rows that read a band follow the shape; the
`bandCartesian` kernel rows (`forceProbes`, `absentValue`, `nonIdentityParams`)
move in their x components only — the probe nodes sit at absolute x and the
window is now about the origin, so different nodes are outside it. Tier B:
every fixture's `seededPositions` move by exactly (−190, −median of the present
Y centres) — a pure translation, verified node by node (−190 on every x; −120
on decomposition and stress, +40 on the three nexus-based fixtures);
`afterShortRun.default` is the same translation within a pixel, since the
first ticks no longer relocate nodes by the median; the radial and topological
scenarios differ by more, from the different start. `seedAt` is unchanged (its
y lies inside the shifted band on every fixture). Every structural invariant
is equal. The occupancy diagnostic (not goldened — D24, D26) moved on stress
from 3/53 to 32/53 and by at most one elsewhere: the new seeding lands stress's
forty activities in a different basin of the same forces, and the X axis is
inert on it by the measurement above.

— 2026-10-21 — agent

**D54 — What REVIEW_5a changed: one frame for seed, force and overlay; a
seed that pre-orders the tiers; the band axes under the pair axis's rules
(Unit 5a close).** The five-lens review found the seed and the force in
different frames, the seed in the wrong geometry under radial, and D53's
headline measurement false. The fixes are model changes:

1. **One layout frame** (`layoutFrame`: median centre per axis, ring radius
   per Y bucket) computed over the simulation's WHOLE node set, shared by
   seeding, the kernels and — through the view — the overlay. The force used
   to re-centre on the visible subset, so at the app's default filter the seed
   and the force disagreed by the median of the hidden tiers (C1, blocker).
   A frame over the visible set would also move with every filter toggle. A
   node in no bucket joins no median and rests at the axis's centre (C5): the
   absent band used to be a declared point at 0 that was shifted like the
   rest and skewed the median.
2. **The seed pre-orders the tiers.** Seeding at the re-centred band centre
   was consistent and bimodal: on stress, a third of RNG seeds left the
   bottom tier wedged above the one over it (C6 — a regression D53 had called
   chaos). `kickoff/studies/seed-bias.md` measures five rules over 24 seeds
   on three fixtures; a seed biased toward the band's bottom edge by
   `SEED_BIAS = 0.35` of its height gives the pre-5a occupancy on every seed.
   The frame is unchanged by the bias: seed and force still agree.
3. **Radial seeds on the ring** (bucket radius, random angle; children near
   their parent's angle), and `seedAt` snaps into the frame on both axes in
   cartesian and onto the ring in radial; children's inherited X is clamped
   into their own X band (C2).
4. **Acting is mode-aware** (C3): `bandAxesActing` (in radial only Y counts),
   `topologicalActing` (switch AND strength), and center gravity when neither
   — one predicate for the tick and the overlay, which drew rings for a force
   that did nothing.
5. **One retune rule** (C4): `retunedFor` re-buckets every tuning the same
   way; what "fits" means is the one thing passed in. The band axes used to
   skip the ceiling and keep foreign overrides on fallback; bandX had no
   reader.
6. **The overlay is data** (C8): `bandOverlay` in the engine — stripes per
   axis (buckets sharing a band share a stripe), rings, colours — and the
   canvas only draws it; a hovered bucket drawn nowhere dims nothing (C10).
   Tier B goldens the overlay per fixture, cartesian and radial.
7. **Gates** (C8, C9): `seedAt` is probed out of band on both axes and in
   radial; `bandAxes` retune probes; `outsideBandX` printed beside the Y
   diagnostic; `dts-gate` walks the declaration graph from `lib.d.ts` and
   refuses a reachable private engine module (the surface gate compared
   names only); the component manifest is inverted — every top-level
   component is in unless excluded by name as the host's, after the second
   new component in two units was left outside every ratchet.
8. **Casts and dead weight** (C11): the three `as Partial<ForceParams>` in
   `AxisControls` are typed per-axis patches; the dual-range stylesheet and
   its per-type emitter, kept alive by a golden row, are gone; the spec's
   pre-5a sentences and the code's are rewritten.

**D53, corrected.** "The X force never fires on any fixture" was measured on
one fixture after a full run and generalised; it fires on nexus, taskqueues
and multifile after tick 29–54 (C7). What is true: the default horizontal
physics is identical by construction — every type's X band is the window the
global one was — and `outsideBandX` now prints the firing count per fixture.
`afterShortRun.default` was "within a pixel" of the translation on three
fixtures and within 12 px on decomposition and 5 px on stress; `centerOnly`
moved by up to 20 px and was not mentioned. "Chaos" for stress's 3/53 → 32/53
was wrong: point 2.

**Golden change (§8.2).** Tier A and Tier C byte-identical. Tier B: seeded
positions move by exactly `0.35 × (band height)` in y per bucket and not in
x, verified node by node; the radial scenario reseeds on the rings;
`seedAt` moves (its point is now far outside every band, so the clamp is what
it pins); new rows `seedAtRadial`, `overlay`, `overlayRadial`; every
structural invariant equal; the occupancy diagnostic on stress is 3/53
again. `static`: the band-kernel rows (`absentValue`, `bandCartesian`,
`bandRadial`, `nonIdentityParams.bandCartesian`) move — the unbucketed probe
node no longer joins the median and rests at the centre; `generatedCss` loses
the per-type dual-range rules; `tuningProbes.overrides.firstTick*` follow the
seed; `tuningProbes.retune.bandAxes` is new. Nothing else moves.

— 2026-10-21 — agent

**D55 — Computed scalar axes: a number per node as a layout axis (Unit 5b).**
A layout axis may key on a computed scalar instead of a mapping (R8, R9,
R28, R31). The model, chosen so that the scalar path is the band path with
the bucket removed, not a second force:

1. **The interface** (`graph/scalar.ts`): `ScalarAxis { id, label, tooltip,
   compute(graph) }` answers one value per node in `[0, 1]` from a
   `ReadableGraph { nodes, edges, getNode }` (model.ts — the one shape the
   frame, the scalars and the view's visible-graph derivation read; a
   `Simulation` satisfies it) — node metadata (a host's own payload
   included) and the graph's structure, nothing else. A node absent
   from the answer has no value on the axis and rests at its centre, as a
   node in no bucket does. Three built-ins read only structure: **reach**
   (the downstream-depth score topological gravity already computed, moved
   here as `computeDownstreamReach` and read by the view over the visible
   subgraph, by an axis over the whole graph), **degree** (dependency edges
   in and out over the busiest node's) and **depth** (containment depth over
   the deepest). A host adds its own through `OntologySpec.scalars`;
   `createOntology` refuses a duplicate id. The ontology is not on the
   public surface (C3), so this is not a surface change.
2. **The tuning**: `LayoutTuning = AxisTuning<BandRange> | ScalarTuning`,
   where `ScalarTuning { scalar, span: ScalarSpan }` and `ScalarSpan { zero,
   one }` is where a score of 0 rests and where 1 rests, in world units.
   Either may be the lower: the span reads like a chart's axis and flips by
   dragging its ends past each other. `defaultSpan` is the declared bands'
   extent on that axis centred on the origin, 1 at the top and at the right
   — so a new scalar axis keeps the layout's scale and reads as a chart.
3. **The frame answers per node** (`LayoutFrame.rest(axis, node)`,
   `ringOf(node)`): a mapped axis's re-centred band, a scalar's point
   `zero + s·(one − zero)`, or nothing. Scores are computed once per frame
   over the WHOLE node set (D54's rule), so seed, force and overlay agree.
   The kernel is one function, `pullToRest`, for both kinds: a scalar's rest
   is a band of zero height, so the force is always on and the strength and
   exponent sliders mean what they meant. In radial a scalar Y rings each
   node by the `ringRadii` rule — the span's low end innermost — so radial is
   a pure function of the cartesian rest on both kinds.
4. **The overlay** is still data: a scalar axis is one stripe carrying
   `gradient: ScalarSpan`, and the canvas draws it from the 0 end to the 1
   end; a scalar Y in radial draws no rings (every node has its own).
5. **The controls**: the axis dropdown lists the mappings that fit the
   ceiling, then every scalar the taxonomy knows (R28 completed); the
   equation varies by kind (R29 completed — `d = |p − p₀ − s·(p₁ − p₀)|`);
   and `ScalarPlot` — a gradient between two free handles labelled 0 and 1 —
   replaces the columns (R31). The pair axis stays mappings-only: push and
   pull need buckets.
6. **Retuning**: a scalar tuning has no buckets to go stale, so a graph
   change keeps it by reference; a taxonomy that no longer knows the scalar
   (a swap) falls it back to the style identity. Probed in
   `tuningProbes.retune.bandAxes.scalar`.
7. **Tier B's residence diagnostic** reads from the frame, so it typechecks
   on either kind; the run it prints for is the default, mapped one.

**Golden change (§8.2).** Tier A and Tier C byte-identical; Tier A gains
`scalars` — every built-in's value per node per fixture. Tier B gains the
short runs `yReach` and `yReachRadial` and the row `overlayScalarY`; every
existing row is byte-identical (the `downstreamScores` rows prove the moved
function is the same function). `static` gains `tuningProbes.retune
.bandAxes.scalar`. Every line of every diff is an addition; the one removed
line is the trailing comma a new sibling added. Nothing else moves.

— 2026-10-21 — agent

**D56 — What REVIEW_5b changed: a pull that reaches its rest and no further;
one answer for a node with no value; a span the taxonomy owns until the user
takes it; every scalar claim with a reader (Unit 5b close).** The five-lens
review (39 findings, 16 clusters, 9 verified, 0 refuted) found one blocker in
the model and the rest in what the gates could not see.

1. **The pull is capped at the distance** (C13, the blocker). A scalar's
   rest is a point, so the band force has no dead zone there: at exp ≥ 2 the
   uncapped `|d|^exp` impulse overshot the point every tick and nodes bounced
   up to the velocity ceiling (stress at exp 3, measured by the finder: mean
   speed 47.7 after a nudge, 2163 sign reversals in 50 ticks; mapped Y at the
   same exponent: 0.07 and 33). `bandForce` now returns at most `|d|` — the
   pull reaches the rest, never beyond it — on both axes and on the ring, one
   rule. At exp 1 with strength ≤ 0.25 the cap never binds, so no default
   golden moves. Tier B's `scalarSettlesAtExp3` runs Y reach, X degree,
   radial reach and mapped Y (the control) for the full run, a slider-sized
   nudge and a quarter run, and pins that fewer than half the node-ticks
   reverse and the mean speed is under 1: measured 0.000 reversals on every
   fixture, speeds 0.001–0.9 (the uncapped force: 47.7).
2. **One answer for no value** (C12, C1). `LayoutFrame.rest` and `ringOf`
   answer the centre themselves ({0, 0} and 0) instead of an `undefined`
   that seed, force and diagnostic each re-defaulted; in radial a node with
   no value on Y now rests at the origin (the kernel skips its outward kick
   there) where the force used to leave it wherever it was. The built-ins
   answer a true 0 for every node when their maximum is 0 — a graph with no
   dependency edges, or no containment — instead of an empty map the frame
   read as absence and drew mid-gradient.
3. **A span the taxonomy owns** (C9). `ScalarTuning.span` is optional —
   absent until the user drags an end — and `resolvePhysics` fills it from
   `defaultSpan`, which lives in forces.ts on the same `declaredBand` fold
   (and the same empty answer) the band axes use. A scalar axis follows a
   taxonomy whose declared bands change, as a band axis does (D47).
4. **The [0, 1] contract has a reader** (C3). `layoutFrame` checks every
   scalar answer once per frame — finite and in [0, 1] — and throws naming
   the scalar and the node; `scalarProbes.contract` pins the message for 2,
   for NaN, for a duplicate id and for an unknown scalar.
5. **The host-scalar path has a reader** (C4). `scalarProbes.hostScalar`
   declares a scalar through `OntologySpec.scalars` that reads its own
   payload (the id's length), resolves it on Y and records every rest;
   `noValue` pins the centre, on the axis and on the ring, for a scalar that
   answers for half the nodes; `degenerateSpan` pins a zero-extent span;
   `flippedSpan` pins that rests and rings mirror.
6. **Scalar X, flipped and degenerate spans are pinned** (C2). Tier B gains
   `xDegree`, `yReachFlipped` and `yReachFlippedRadial` short runs and
   `overlayScalarYFlipped`; `scalarProbes.defaultSpan` records both axes'
   defaults — 1 at the right, 1 at the top.
7. **The view never holds a tuning the taxonomy refuses** (C5).
   `useSimulation` retunes in render (`retunedFor` in a memo) and the raw
   state catches up in an effect; the simulation takes its params in an
   effect after that retune. The comment in `resolvePhysics` said the
   fallback ran first; now it does.
8. **One spelling of a layout-axis choice** (C7). `layoutAxisKey` is what
   the dropdown offers and what a tuning answers to;
   `tuningProbes.layoutAxisKeys` pins uniqueness and the round trip.
   `AxisControls` branches on the resolved axis and narrows the tuning
   loudly (`mappedTuning`); its silent `null` branch is gone.
9. **No import cycle, no dead parameter** (C10). `ScalarSpan`,
   `ScalarTuning` and `isScalarTuning` live in scalar.ts, which imports
   only the model, so forces.ts imports no value from simulation.ts.
   `applyBandGravity` and its radial half drop the `resolved` they never
   read. `mappedAxis` has its production caller.
10. **Reach answers for exactly the graph's nodes** (C11). The containment
    walk reads `getNode` and stops at an ancestor the graph does not hold,
    so over the visible subgraph the answer no longer carries hidden ids nor
    normalises by them: the top visible node scores 1. All three built-ins
    read through `ReadableGraph.getNode`.
11. **The record** (C8). The spec's § Gravity names both kinds, calls the
    topological quantity reach (the built-in it is), states the one-frame
    rule in place of "each tick … the visible set", and says how the X plot
    reads — a rotated chart, larger x higher, so 1 sits at the top of either
    plot, and `AxisControls` now draws it so. The leak-ceiling gap (PLAN 80,
    gate 180) is reconciled in PROGRESS. The scalar plot's gradient id is per
    instance (C16); `screenshot.mjs` exits 1 when a panel step did not apply
    (C15); the dts gate refuses a reachable `graph/ontology.d.ts` or
    `graph/scalar.d.ts` (C14).
12. **Deferred** (C6, minor). The view computes its own frame — and so a
    selected scalar — beside the simulation's, as it resolves its own
    physics; `layoutAxisOptions` now takes the axes the view measured, which
    was the other half of that cluster. The double frame is filed as a
    GitHub issue at close.

**Golden change (§8.2).** Tier A: `visibleSubgraph.<state>.downstreamScores`
in every state with a hidden tier loses the hidden ids and renormalises
(point 10); `scalars.*` and every other row byte-identical. Tier C
byte-identical. Tier B: every existing row byte-identical; new rows
`afterShortRun.{xDegree,yReachFlipped,yReachFlippedRadial}`,
`overlayScalarYFlipped`, `scalarSettlesAtExp3`, and `params` gains
`settledSpeed` and `settledReversals`. `static`:
`forceProbes.absentValue.bandRadial.velocities.unknown` moves from (0, 0) —
the undeclared node is pulled to the origin now (point 2);
`syntheticVisible.cases.*.downstreamScores` fill with zeros where they were
`{}` (point 2) and the hidden-tier case renormalises (point 10); new
`tuningProbes.layoutAxisKeys` and `scalarProbes`. Nothing else moves.

— 2026-10-22 — agent

**D57 — The colour scheme is the taxonomy's, both themes at once; the canvas
reads the theme; one edge classifier; the graph pane chooses its theme (Unit
6).** R10, R11, R15, R16, R21; T6, T11, T13, T15; B22, B23, B25, B29, B30.
The model, chosen so that colour is stored once and read everywhere:

1. **The scheme object is the taxonomy.** `NodeTypeDefinition.color` is a
   `ThemedColor { light: ColorPair, dark: ColorPair }` — every value declares
   both themes, no optional dark half to half-migrate (T15) — beside the
   `size` it already carried, so a host swapping schemes swaps one object
   (D14, R11). `EdgeTypeDefinition.style` is an `EdgeStroke { color:
   { light, dark }, alpha, dash, width }`: the edge palette is injected per
   edge type, not a library table of literals. `cssVarSuffix` is gone: the
   custom-property name is derived (`cssSuffix` kebab-cases the value id),
   so the injector's output is byte-identical and nothing stores a name.
2. **One edge classifier** (T11, B22). A stroke is the resolved edge type's:
   `edgeStrokeFor(edgeType)` on the ontology, and `edge-styles.ts` — the
   renderer's second classifier — is deleted. Where the two disagreed the
   physics classifier won: every disagreement over the five fixtures (66
   graduated-edge rows, none on a full graph) was the renderer's rule "an
   edge carrying `nexusEndpoint` metadata is a nexus call", which kept a
   spliced caller→backing edge pink after the operation was filtered out.
   Those edges now draw as what the physics says they are — a workflow,
   worker or namespace dependency. The metadata stays: the endpoint's
   transitive highlight reads it. Tier C and Tier A's graduated-edge rows
   record the edge type alone; the style column is gone because the style
   is the type's.
3. **The canvas reads the theme** (T15, B23, B25): node bodies, push rings,
   the band overlay's colours and edge strokes all resolve through
   `color[theme]`; the group-glow palette stays the library's own cycling
   table (not per value, so not the scheme's — a future scheme field, not
   this unit's). `withAlpha` normalises any CSS colour the browser can parse
   (hex of either length, `rgb()`, names through a memoised 2D-context pass)
   and answers a neutral for anything else with one `console.error`, never a
   throw inside the draw loop (T6, T4).
4. **The theme is the graph pane's choice** (R21). A three-state toolbar
   button — system, light, dark — persisted with the pane's other state; the
   resolved theme is the choice, or the host's when system: an ancestor
   `.vscode-dark` / `[data-theme="dark"]`, else `prefers-color-scheme`,
   observed for change. An explicit choice sets `data-theme` on the pane's
   root, and the stylesheets key their dark rules on
   `:is(.vscode-dark, [data-theme="dark"])` and their light defaults on
   `:root, [data-theme="light"]`, so the pane can be dark in a light host
   and light in a dark one.
5. **Per-value CSS is inline** (B29, B30). The pane's root carries
   `--color-<suffix>` / `--color-<suffix>-border` for every style value in
   the resolved theme; tokens and typed slider rows read them; a filter chip
   borrows a style value's colour as it borrows its icon (`FilterChip.tint`),
   and its hover and active backgrounds are `color-mix` of that tint at a
   per-theme percentage — the sixteen literal `rgba()` tints and their eight
   dark overrides are gone. `mountNodeTypeStyles` stays on the public
   surface (C3) and emits the same `:root` variables from the default
   taxonomy for a host's own CSS; the library's components no longer depend
   on it, and its typed-row classes — read by nothing once the rows are
   inline — are not emitted.
6. **R16** (every label and abbreviation configurable) was already the
   spec's: `styleLabel`, `abbreviations`, each style's `label`, each edge
   type's `label`, each filter dimension's and chip's `label` — the
   `ALTERNATE` and `OTHER_AXIS` probes have pinned that since Units 4 and 5.
   Recorded here as covered, not re-done.

**Golden change (§8.2).** Tier C: every row loses its style column; the
edge-type column is byte-identical on all 245 rows (D3's condition, checked
by diff). Tier A: `graph.edges` and every state's `graduatedEdges` lines
lose the style column likewise — format only, checked line by line — and
`edgeClassification.byStyleKey`, the renderer classifier's histogram, is
gone; the 66 rows above are the ones whose colour changed on screen, and
they are pinned now as the composition of two rows — the edge's type here
and that type's stroke in `schemeProbes.strokes`. `static`: `generatedCss`
loses the seven typed-row class lines; the synthetic cases' `graduatedEdges`
lose the style column; new `schemeProbes` (the suffix rule, the colour
normaliser's table, the inline variables under the default and an alternate
palette, the stroke per edge type, the sizes). Nothing else moves.

— 2026-10-22 — agent

**D58 — What REVIEW_6 changed: one resolver for the theme, carried as an
attribute and as tokens; the scheme in its own namespace, refused where a
reader could not read it; summaries that read the taxonomy (Unit 6 close).**
The five-lens review (42 findings, 17 clusters, 12 verified, 0 refuted)
confirmed two filed blockers at major and found the rest in what D57 had
claimed and not checked.

1. **The dead selectors** (C1, blocker). The eighteen dark rules Unit 6
   converted were written `[data-theme=\"dark\"]` — backslash-escaped quotes
   in CSS, an attribute value that includes the quote characters and matches
   nothing — and every gate was green. They are gone, not fixed: every
   theme difference is now a token on the themed root (`--accent`, the tint
   percentages, `--hover-bg`, `--inset-bg`, `--key-bg`, `--tooltip-shadow`),
   read by component rules that key on no ancestor class. The pattern gate
   refuses a backslash-quote in any stylesheet.
2. **One resolver** (C2, blocker; C3). The hook resolved Auto through
   `prefers-color-scheme` and the high-contrast class while the stylesheets
   keyed dark on `.vscode-dark` and `[data-theme="dark"]` alone, so a dark OS
   in a plain browser drew a dark canvas on light chrome — which is how the
   first "light" captures came out dark on a dark-OS machine. The pane now
   ALWAYS carries its resolved theme as `data-theme`, and the canvas root
   carries the host's; the token blocks (`:root, [data-theme="light"]` and
   `.vscode-dark, [data-theme="dark"]`) set variables on the element that
   carries the attribute, and a variable inherits from the nearest ancestor
   that sets it — so a pane choosing Light inside a dark host is light, and
   Dark inside a light one dark, in every rule, not only the variables.
   `hostTheme` reads the marker ABOVE the pane, never the pane's own
   attribute, and reads VS Code's high-contrast-light class before the plain
   high-contrast class it is paired with. The screenshot script emulates the
   colour-scheme preference and fails a capture in the wrong theme.
3. **The scheme's own namespace** (C5, C4). A value's variables are
   `--node-<suffix>` / `--node-<suffix>-border`: the chrome's `--color-*`
   tokens are no longer anything a value id can overwrite, and T13 is closed
   for real — `index.css`'s `--color-workflow` is the tree's token and the
   injector no longer emits a second one. `createOntology` refuses two
   values whose ids kebab-case to one name, a value whose id kebab-cases to
   nothing, and any colour that is not hex or `rgb()` — the one form every
   reader parses without a browser; the 2D-context pass is gone with the
   reader it never had. The chrome's accent is its own token, `--accent`,
   not the workflow value's fill: the forty literal purple tints are
   `color-mix` of it at the theme's percentage.
4. **The tree's chips read the taxonomy** (C11). The canvas root carries
   the scheme's variables for the host's theme, so a chip outside the pane
   tints from the taxonomy as one inside does; `mountNodeTypeStyles` is,
   now truly, for a host's own CSS.
5. **A persisted choice is sanitised** (C10, major): `themeChoiceOf`
   answers system for anything outside the three — the field is discarded,
   not the state (D4).
6. **Summaries read the taxonomy** (R16; C9). `summaryKind` is `children |
   degree | none`; a children summary counts contained nodes per style
   value in the taxonomy's order and names each by its abbreviation
   (`2 Wk · 1 Ep`). The four value names and three abbreviations the library
   had hardcoded are gone.
7. **The reader path has a reader** (C7). Tier A's
   `edgeClassification.byStroke` histograms the stroke each fixture edge
   draws with, through `edgeStrokeFor(resolveEdgeType(…))` — the composition
   the 66 rows are pinned by; `schemeProbes.refusals` pins point 3,
   `markers` the marker rule, `choices` the sanitiser.
8. **Shapes** (C-pair-stroke, C-neutral). A spring category's description
   is `EdgeCategoryDescription` — what a token needs — so no fabricated
   stroke; an unstyled bucket's overlay colour is `undefined` and the canvas
   draws its one neutral, the token's.
9. **The host-supplied scheme** (C8). A host configures colours, sizes,
   labels and abbreviations through `OntologySpec`, which is in-tree until
   Unit 8 publishes the library's surface (C3 freezes `lib.ts` until then);
   R10, R11, R15 and R16 are covered in-tree, and the public surface for
   them is Unit 8's.
10. **The record** (C13). D57 enumerated the 66 fixture rows; the 115
    synthetic pair rows and 3 synthetic-case rows whose colour also changed
    are the same rule on hypothetical edges, pinned by the same composition.
    A spliced edge draws as whatever its type says — a workflow, worker or
    namespace dependency.
11. **Minor**. `FilterChip.tint` restates a style value by string; it is
    checked at render and said once on the console, never thrown (T4). The
    leak ceiling is ratcheted at this close, with the arithmetic in
    PROGRESS.

**Golden change (§8.2).** Tier C byte-identical. Tier A: `nodeSummaries` in
every state (point 6); `edgeClassification.byStroke` new. `static`:
`generatedCss` names its variables `--node-*` (point 3);
`nodeTypes.{namespace,worker,nexusService}.summaryKind` read `children`;
`ontologyProbes.injection.*.summaries` (point 6); `schemeProbes.defaultVars`
renamed likewise, and `refusals`, `markers`, `choices` new. Nothing else
moves.

— 2026-10-22 — agent

**D59 — Controls offer what the visible set holds; the last three behaviours
are the taxonomy's (Unit 7).** R35; B16, B17, B35; leak ceiling 0, reached
to within the host's wire types.

1. **Post-filter-scoped controls** (R35). A control offers only what the
   post-filter visible set holds: a push token per bucket some visible node
   falls in, a pull token per spring category some visible edge falls in, a
   column per such bucket on each layout axis. The view computes one
   `PresentSets { push, bandX, bandY, springs }` from the visible nodes and
   edges and the panel hands each control its half; a bucket's tuning is
   kept, unshown, for when its nodes return. The axis dropdowns alone still
   measure the whole graph — an axis's usability does not flip with a
   filter. Tier A records the sets per filter state (`controls`).
2. **The hidden-node policy is the taxonomy's** (B16). `NodeTypeDefinition
   .whenHidden: 'ascend' | 'splice'` says what a dependency edge touching a
   hidden node of that value does — re-point to the nearest visible
   ancestor, or follow the node's own dependency edges through. The adapter
   says `splice` for the operation and `ascend` for every other value; the
   derivation reads the policy and names no value. On a collision between
   two graduated edges the spliced one keeps precedence — it still carries
   what the hidden hop knew — which is what the old rule "prefer the edge
   carrying `nexusEndpoint`" meant, said without the payload key. Every
   graduated-edge row is byte-identical (the proof the plan asked for);
   `ontologyProbes.hiddenPolicy` shows the two answers on one chain.
3. **The hover box's context line and the highlight are hooks** (B35, and
   the routing highlight). `OntologySpec.contextLine(node, parent)` (default:
   the parent's name) and `OntologySpec.highlight(active, base, graph)`
   (default: the library's transitive walk) carry what the library used to
   hardcode: the nexus values' `<parent> · <queue>` lines from their own
   payload keys, the endpoint's highlight by routing metadata, the service's
   widening by the endpoints fronting its operations. The icon in the hover
   box is the value's own; the host's filter descriptors are no longer
   imported for it (one boundary violation fewer). Tier A records the
   context line per node (`contextLines`) and the hook's answer for the
   first visible node of each value per state (`hookedHighlights`).
4. **Focus by values** (B35). A cross-view focus target is the library's
   `FocusTarget { name, values }` — the shape the reconciler already used —
   and the view matches a node on the name and every value the target names
   (`matchesFocus`); the host pins a name with whatever axis it has, and the
   view never learns which. `onShowInTree` hands the host a target built
   from the node's own dimensions.
5. **The summary dispatch** (B17) was Unit 6's (D58 §6): `children | degree |
   none`, read through `abbreviationFor`. Nothing remained to inject; the
   row is counted here because the plan assigned it here.
6. **Vocabulary.** The library's manifest reads 4 occurrences, all the host's
   wire types in two props (`ast: TWFFile` on the view and the filter bar,
   with their imports) — what Unit 8's library move replaces with a `Graph`
   built by the host. Every comment, token and literal is gone: the tension
   colours are chrome tokens (`--tension-*`), and the leak ceiling is
   ratcheted to 4 with the arithmetic in PROGRESS.

**Golden change (§8.2).** Every existing row byte-identical — summaries,
graduated edges, Tier C, static. Added: Tier A `contextLines` (whole graph)
and, per filter state, `controls` and `hookedHighlights`;
`ontologyProbes.injection.*` gain `graduatedEdges` and `contextLines`;
`ontologyProbes.hiddenPolicy` new. Nothing else moves.

— 2026-10-22 — agent

**D60 — What REVIEW_7 changed: the controls offer what the simulation
springs, the view's wiring is what the harness pins, the hidden-node
precedence reads metadata, and D59 §2 is corrected (Unit 7 close).** The
five-lens review (33 findings, 9 clusters, 9 verified, 0 refuted) confirmed
four of the six filed-blocker clusters at major and found the rest in what
D59 had claimed and not measured.

1. **Stale curves** (C1, blocker → confirmed major). `ChargeCurves`
   memoised its curves on the parameters alone, so a chip toggle dropped
   the map's tokens and left every curve. The memo keys on the present set.
   A server render cannot see a stale memo, so Gate 5 carries this one: the
   screenshot script's `--toggle` fails a capture whose counts after the
   toggle equal the counts before (record-9).
2. **The dead endpoint highlight** (C2, blocker → confirmed major). The hook
   compared the routing metadata — the endpoint's node id, as the parser
   writes it — to the endpoint's bare name, so no call ever lit, and D59's
   new `hookedHighlights` rows pinned the empty answer. It compares the id.
   Every such row moves: the endpoint's edges populate, and because the
   harness now calls `highlightOf` (§5) each row carries the whole
   highlight — the library's walk, the hook, the derived edge ids — where it
   carried the hook's answer over the active node alone and the word
   "derived".
3. **The splice recursion** (C3, blocker → confirmed major; older than D59,
   in code D59 rewrote). Two hidden spliced nodes that call each other
   recursed without end — a valid `.twf` with two sync operations
   nexus-calling each other blanked the Graph view at the default filter. A
   hidden node is passed through once per resolution (`visited`);
   `hiddenPolicy.cycle` pins the chain. And `createOntology` refuses a
   `whenHidden` outside its two values instead of reading it as ascend (C8,
   model-7), pinned in `schemeProbes.refusals.badWhenHidden`.
4. **Precedence by metadata; D59 §2 corrected** (C4, major confirmed). D59
   §2 said "the spliced one keeps precedence … is what the old rule meant,
   said without the payload key". It was not: the rule was a boolean
   last-wins among spliced edges, which agreed with the old payload rule
   only in the parser's edge order (168 of 640 fixture states differ under
   the reverse order). The rule now reads whether an edge carries metadata
   (`carriesMetadata`): between two graduated edges on one pair, the one
   carrying payload keeps precedence over one carrying none, in either
   order — `hiddenPolicy.collisionCallFirst` and `collisionCallLast` both
   answer `caller -> backing|meta=route`. Every fixture graduated-edge row
   is still byte-identical.
5. **The view's wiring is what the harness pins** (C5, blocker → partly
   major; C9, blocker → confirmed major). Tier A's `controls` re-derived R35
   in the harness, so the view could read the whole graph with every gate
   green — and it did read the wrong edges: pull tokens were classified
   over the graduated edges the canvas draws, which the simulation never
   springs, so the `linkWorkflowToWorkflow` token under the default filter
   tuned nothing (its six edges all graduated; zero displacement under an
   override). The predicate is stated once, in the simulation
   (`sprungEdges`), and `presentSetsOf` (`components/graph-view/present.ts`)
   is the one function the view, Tier A and the new `viewProbes` call;
   `highlightOf` (`graph/highlight.ts`) is likewise the one highlight the
   view and Tier A call. `viewProbes` server-renders the push/pull and
   gravity tabs under three states of the nexus fixture and counts what
   they offer against the sets — all types: 20 tokens = 7 push + 13 pull and
   28 column handles = 2 × (7 + 7); the default: 4 and 8; none: 0 and 0 — and
   pins `matchesFocus` on six targets. `controls.springs` moves where a
   category was held only by graduated edges: `linkWorkflowToWorkflow`
   under the default filter on the nexus, multifile and taskqueues
   fixtures, the worker categories where workers are hidden on all five,
   `linkWorkerToWorker` in two decomposition states.
6. **The boundary gate sees host components** (C6, blocker → partly major).
   An import that resolves to a shim component (`SHIM_COMPONENTS`) counts;
   the gate had been blind to `GraphView`'s imports of `GroupsModal` and
   `protocol`, through which any host vocabulary could ride uncounted.
   Measured **8**; the ceiling rises 6 → 8 with that reason — the two edges
   were always there, and are Unit 8's to cut. Not changed: the pattern
   gate's `as-record` rule keys on spelling and the harness is outside it
   (gates-6, minor) — the harness is not shipped.
7. **Prose, and the two sets called "present"** (C7, major → partly minor).
   "Present" names two sets and D59 named one: the frame's — the median of
   the band centres present over the WHOLE graph, which seeds, pulls and
   draws the overlay (D54) — and the controls' — what the VISIBLE set holds
   (R35). D59 §1 reverses D51's whole-graph pull tokens and leaves D54's
   overlay whole, and said neither; this says both. The spec names both at
   the two places they meet, the axis dropdown's title says which set its
   tokens are and what its counts measure, and the two stale comments (the
   derivation's header, the highlight hook's orphaned doc line) are gone.
   Not done: an empty state for a tab whose visible set holds nothing
   (controls-4, minor) — an issue at the close.
8. **One focus shape** (C8, model-8). `CrossViewTarget` is deleted; the
   host and the view exchange the library's `FocusTarget { name, values }`,
   and a miss is a miss rather than `''`. Not changed: the hooks read
   `TEMPORAL_TYPE_DIMENSION` (record-5) — the host's one constant, from
   which its `styleDimension` is assigned; the hooks are the host's, and a
   host reads its own axis by its own name.

**Golden change (§8.2).** Moves: every per-state `hookedHighlights` row
(edges from `"derived"` to the derived ids, nodes to the whole highlight;
the endpoint's edges populate); `controls.springs` where a category was
held only by graduated edges (§5). Added:
`static.ontologyProbes.hiddenPolicy.{collisionCallFirst, collisionCallLast,
cycle}`, `static.viewProbes`, `static.schemeProbes.refusals.badWhenHidden`.
Byte-identical: every graduated-edge row, every summary, Tier B, Tier C,
`edge-types`, and every other static probe.

— 2026-10-22 — agent
