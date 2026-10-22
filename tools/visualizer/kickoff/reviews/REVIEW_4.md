# Review — Unit 4 (push/pull on a chosen dimension)

**§3.2 review record. PR scope.** Second run under the §3.5.6 rules and the
first under rule 11 (Sonnet by default, Opus on the physics and gates lenses).
Six finders in isolated worktrees, one Sonnet clusterer, Sonnet verifiers in
isolated worktrees — rule 8 held this time.

**55 findings, 54 reproduced** (as filed: 7 blocker, 17 major, 31 minor; as
clustered: 7 blocker, 10 major, 9 minor), across **26 clusters**, **17
verified, 0 refuted** — and **5 of the 7 blocker clusters were downgraded** by
their verifier (three to major, two to minor). **24 agents, 3.52M subagent
tokens.**

Every cluster at blocker or major, as filed or as clustered, is resolved with
the sha that resolved it. Two are deferred to one issue, by design.

## The rules, measured

| | Unit 2 | Unit 3 | Unit 4 |
|---|---:|---:|---:|
| agents | 20 | 15 | **24** |
| tokens | 2.00M | 1.86M | **3.52M** |
| findings → clusters | 31 → 29 | 42 → 20 | 55 → **26** |
| clusters verified | 14 of 14 | 8 of 20 | **17 of 26** |
| refuted | 0 | 1 | **0** |
| blockers downgraded by verification | — | — | **5 of 7** |

The spend nearly doubled, and the measurement says where: the verify stage,
again. Rule 6 says verify only what is in doubt; the clusterer applied that to
*its own* severities, and it rated seven clusters blocker where the finders
had filed two of their members as blocker. Seventeen verifications followed,
refuting nothing and downgrading five. The clusterer should not rate. Recorded
as rule 12: verification is triggered by a finder's own claim — unreproduced,
filed blocker, or contradicts a decision — and the clusterer only groups.

The unit was worth the review. c1 is a genuine blocker: every push bucket off
the style axis resolved to the fallback style's physics, with a false warning
each. I had shipped the dropdown that reaches it, exercised it in a browser,
and seen tokens where I expected tokens. The picture was right; the number was
wrong, and nothing numeric was under a golden on that path.

What failed on the harness side is the worktree itself (F19): every finder's
worktree started at **main**, not at the unit's HEAD. All six detached to the
right sha because the prompt named it and the schema asked for `headSha`;
without that line this would have been a review of main.

## Blockers (as clustered)

| # | cluster | finding | verify | resolved by | how |
|---|---|---|---|---|---|
| 1 | c1 | Push/band physics off the style axis resolved through `styleForKey`: every file/kind bucket got the fallback's −300/30 and a false "placeholder styling" warning, and no gate saw it | confirmed, major | `a2d0b1d` | Off the style axis a bucket starts from the host's *typical* declared physics — the same fold, over every declared value; springs likewise from `typicalSpring`, not a constant. `tuningProbes.foreignAxisPhysics` pins the values and that they are not the fallback's. |
| 2 | c12 | `valuesByDimension` was optional: the Tree view omitted it, so Kind could not be re-added there (and the loss persisted); GraphView supplied the file axis twice | partly, major | `a2d0b1d` | Required, and the one source for every axis; the Tree view supplies both; `allFiles` is gone from the bar. |
| 3 | c13 | After D50 the injection probe's visibility half took no input from the container | partly, minor | `a2d0b1d` | `tuningProbes.visibilityPolicy`: the same kind-less node is hidden under the shipped taxonomy and visible under one whose descriptor says `absentMeans: 'visible'`. |
| 4 | c15 | D47's headline, the sparse override channel, exercised by no row | confirmed, major | `a2d0b1d` | `tuningProbes.overrides`: resolution carries the override and leaves neighbours declared, and a Simulation given one moves differently on its first tick. |
| 5 | c3 | `retunedFor` and the ceiling's failing side unpinned; the same-object return broke on node order | partly, minor | `a2d0b1d` | `sameBuckets` ignores order. `tuningProbes.retune` pins same-object, reordered nodes, a file dropped (override kept), the axis vanished, outgrown (30 files: 30 · 29, `fits: false`), and a taxonomy swap. |
| 6 | c5 | `PushPullControls.tsx` sat outside every ratchet | confirmed, major | `7941464` | Named in the manifest — the finders reviewed `acc36cc`, one commit earlier. |
| 7 | c6 | The engine's classification path (signal-send precedence, membership throw) pinned by nothing; Tier C called the shim function directly | confirmed, major | `a2d0b1d` | Tier C classifies through `resolveSprings(…).classify`, byte-identical; `tuningProbes.membership` pins the throw and its message. |

## Majors

| # | cluster | finding | resolved by | how |
|---|---|---|---|---|
| 8 | c2 | The one shared axis stored in `push.mapping` and `spring.mapping` (and band's), held equal by one handler — contradicts D51 | `a2d0b1d` | `PairTuning { mapping, push, spring }` on both param slices: the axis once, two sparse override maps. Band keeps its own by design (5a). |
| 9 | c9 | `pairCategories` built k(k+1) categories per axis per graph change — four million for 2000 files, to produce one disabled option | `a2d0b1d` | The pair rule enumerates nothing: `ResolvedSprings` is `classify` / `physicsFor` / `describe`, and a category exists when an edge falls in it. |
| 10 | c4 | The `'\|'`/`'-'` encoding let a bucket id collide with the separator and counted unbucketed endpoints as phantom tokens | `a2d0b1d` | Ids are JSON triples; an unbucketed endpoint classifies to `undefined`, counted nowhere, pulling nothing. |
| 11 | c7 | The link loop classified every edge every tick; `presentSprings` re-ran on every slider edit | `a2d0b1d` | `Simulation` caches each edge's category per resolved physics; the memo keys on the mapping. |
| 12 | c8 | Every golden ran identity multipliers, so a dropped multiplier, exponent or precision in the hoisted charge code stayed green | `a2d0b1d` | `forceProbes.nonIdentityParams`: every scalar off its identity, one non-integer override, three kernels. |
| 13 | c20 | D47 said the provenance ref had "nothing left to detect"; it was still the only guard against a taxonomy swap, and unpinned | `a2d0b1d` | `retunedFor` rebuilds the style axis from the new taxonomy, overrides kept where values survive; the ref is gone; `retune.taxonomySwapped` pins it. |
| 14 | c11 | Kind abbreviations collided (`wo`, `ne`); the ring could not separate more than five tokens | `a2d0b1d` | Kinds abbreviate as their type does; `identityMapping` numbers duplicates; the ring widens with the group. |
| 15 | c16 | The style value set declared four ways with nothing holding them together; two identity builders | `a2d0b1d` | `createOntology` refuses a disagreement; `createDimensionalMapping` refuses duplicate ids and empty buckets; one `AxisNamer`, one builder. |
| 16 | c14 | Three probe node helpers disagreed on which axes a node carries; the absent-kind policy was unexercised | `a2d0b1d` | All three use the adapter's `dimensionsFor`; the policy is pinned (blocker 3). |
| 17 | c19 | `src/lib.ts`, frozen by C3, checked by no gate | `a2d0b1d` | `surface-gate` holds the exported names to `kickoff/lib-surface.txt`; in `make check-visualizer`. |
| 18 | c23 | The Push/Pull sub-tabs were not keyboard-reachable | `a2d0b1d` | `tabIndex` plus Enter/Space on `SubTab`. |
| 19 | c21 | Host-declared coarsening mappings never landed; the multi-value fold was unpinned | issue | The fold is pinned (`mappedAxisSprings.mappedPush`); the host surface is deferred — below. |
| 20 | c22 | R13 read as "the *default* axis is host-configurable": no host input | issue | The dropdown delivers the user-configurable reading; the host-default reading is deferred with #19. |

## Minors

c10 (the NUL byte is an escape), c17 (`relationOf`, closed and loud), c18
(`directional` removed), c24 (MAP lists files only the harness imports), c25
and c26 (PROGRESS arithmetic and the spec, in the commit that adds this file) —
all resolved.

## Deferred, by design

One issue, filed at close: host-declared coarsening mappings for the pair axis
(c21) and a host-declared default axis (c22). Both are host surface with no
reader until a host wants one (STANDING_CHECKS #4), and the bounded-token
property they were meant to protect is enforced on measured counts instead
(D51).

## On the review itself

- **Worktrees start at main** (F19). Hand the sha, ask for `headSha`, and treat
  a mismatch the agent did not say it detached from as a review to discard.
- **The clusterer rated, and the verify stage paid for it** (F20, rule 12).
- The highest-yield lens was physics, on Opus: c1, c2, c3, c4, c7, c8, c9 —
  seven of the twenty actionable clusters, and the only blocker that was a
  wrong number. The gates lens, also Opus, found the unpinned invariants (c5,
  c6, c15, c19). Rule 11's allocation was right.
- The most valuable schema field is still *what did you break and what did the
  gate say*. 54 of 55 findings came with a run experiment; the one that did not
  (the spec, record-11) was the one a verifier could only confirm by reading.
