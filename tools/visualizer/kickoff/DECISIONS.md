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
