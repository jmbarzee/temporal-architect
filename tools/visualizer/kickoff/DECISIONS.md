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

## Open at kickoff

**O1 — The base-node-size defect (R11) is not yet characterized.** It is known to
be wrong but the specific symptom has not been pinned down. Working hypothesis:
`nodeSizeMul = baseMul × clamp(zoom, 0.4, 1.65)` with `baseMul` 0.6 means a
zoomed-out large graph clamps every tier to `0.24×`, so the size hierarchy stops
being readable and everything becomes a dot. A second candidate: sizes do not
follow tier consistently — `nexusEndpoint` is `r: 15` while its tier-mate
`namespace` is `r: 20`. **Diagnose before changing** (Unit 6), record the finding
here as a decision, and only then fix.

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

**D3 addendum — the behavior-change budget is extended** to cover two changes
Unit 5a necessarily makes: (a) the T12 present-vs-all semantics choice for the
gravity overlay (record which you picked and why), and (b) band-occupancy
differences arising from X gaining a per-value band map where it had a single
global window. Both are §8.2. The list is otherwise closed — anything not named
in D3 is §8.3. — kickoff — human

---

## During the run

<!-- Append below. Do not edit above this line. -->
