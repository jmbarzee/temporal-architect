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
Unit 2c**, which deleted `GraphNode.nodeType` and with it the last two call
sites. Every consumer now reads `ontology.resolveNodeStyle(node).defType`, which
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
