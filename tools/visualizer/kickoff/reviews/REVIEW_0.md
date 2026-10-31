# Review — Unit 0 (Verification net)

**§3.2 review record. PR scope.** Mechanism: the §3.5.2(a)+(b) orchestrated
fan-out recorded in D16 — six blind lenses over the unit diff plus one agent per
named §3.3 cheat, each finding then handed to a fresh agent prompted to *refute*
it. 51 agents; **34 findings survived adversarial verification** (5 blocker, 23
major, 6 minor).

Reviewers received the criteria documents and the raw commit range and nothing
else — no summary from the author, per §3.2. Every reviewer ran the gates itself,
and several proved their findings by breaking the code and watching the gates stay
green. The worktree was verified clean afterwards.

A unit is not complete until every `blocker` and `major` here is marked resolved
with the commit sha that resolved it (§3.2; `PLAN.md` §6.1 gate 7). All 28 are.

| # | severity | finding | resolved by | how |
|---|---|---|---|---|
| 2 | **blocker** | Gate 3 cannot detect that the layout engine does nothing: with all three forces removed, all seven goldens still match | `83dfc19` | Short-run positions per force configuration are goldened; deleting any kernel now turns 5 of 7 goldens red. |
| 11 | **blocker** | Tier B cannot detect a layout collapse: every one of the five force kernels can be deleted and all seven goldens stay green | `83dfc19` | Short-run positions plus direct force-kernel probes; verified by re-running the reviewer probes. |
| 18 | **blocker** | Tier B invariant 1 (`allFinite`) is a tautology — T3's missing-key/NaN path has no detector at all | `83dfc19` | Force probes read velocities BEFORE tick() sanitizes them; verified the T3 path flips allFinite to false and names the nodes. |
| 26 | **blocker** | Tier B's substituted settle assertion (`ticksToStable`) is a constant; band gravity can be switched off entirely with all seven goldens green | `83dfc19` | Band gravity disabled now turns 5 of 7 goldens red — reproduced before and after. |
| 30 | **blocker** | No golden is sensitive to any force parameter — disabling band gravity entirely keeps all seven goldens byte-identical | `83dfc19` | Force parameters goldened, and the short-run positions depend on them. |
| 1 | **major** | The Unit 0c RNG seam is inert: no golden depends on the seed, so a reordered, dropped or added draw is undetectable by every gate | `83dfc19` | Tier B rebuilt: seeded start positions are goldened, so any change to the order or count of draws moves them. |
| 3 | **major** | Gate 6 is defeated by a module specifier without a trailing slash — including `'../adapter'`, the exact folder Unit 2 creates | `6f563ae` | Gate 6 matches path SEGMENTS, so the bare folder import is caught. |
| 4 | **major** | The manifest globber misses new files and new stylesheets, so the leak ratchet can be driven down by a rename instead of a migration | `6f563ae` | Globs widened to .ts/.tsx/.css in all four directories (D27); the remaining blind spots are printed on every run. |
| 5 | **major** | Gate 6's statement scanner misses dynamic `import()` and any multi-line import whose body has a line ending in `;` or `=` | `6f563ae` | Dynamic import()/require() detected; continuation now follows brace balance instead of a semicolon heuristic. |
| 8 | **major** | The entire force model is invisible to all six gates: DEFAULT_PARAMS is goldened nowhere, and no goldened value depends on the seeded RNG | `83dfc19` | DEFAULT_PARAMS and DEFAULT_NODE_SCALE goldened in full; force-kernel probes added. |
| 9 | **major** | All three ratchet gates can be escaped by file extension: a .tsx under src/components/graph-view/ or a .ts under src/components/controls/ is in no manifest | `6f563ae` | Extension set widened (D27). |
| 10 | **major** | T7's absent-value policy — 'a node with no sourceFile is always visible' — is exercised by no golden row, because no fixture node lacks sourceFile | `83dfc19` | syntheticVisible adds a node with no source file, plus the file-filter states that exercise it. |
| 12 | **major** | `ticksToStable`, the substituted settle assertion, is mathematically independent of the graph and the forces — it carries no information | `83dfc19` | Superseded as the settle signal by the short-run position rows; retained as a cheap structural check only. |
| 14 | **major** | KICKOFF §2.3's quality floor "the simulation still settles below threshold on the 53-node stress fixture" is not met, is now unprotected, and the substitution was recorded in DECISIONS but not in PROGRESS § Open Questions as §8.4 requires | `149634c` | Recorded in PROGRESS.md F7 and F10: the §2.3 floor is not met as written, with the measured numbers and why. |
| 15 | **major** | Tier B goldens nothing that depends on the layout: a wholesale physics retune passes all seven goldens byte-identical | `83dfc19` | DEFAULT_PARAMS goldened; a retune is now a visible diff. |
| 16 | **major** | `--write` ships with no executable guard, only a printed warning | `6f563ae` | --write refuses without a DECISIONS.md entry that exists and is about goldens. |
| 17 | **major** | The `--write` log-entry friction was documented in a console message instead of built, leaving the golden gate trivially defeatable | `6f563ae` | Same mechanism. |
| 19 | **major** | No goldened Tier B value responds to the layout: the §2.3 settle floor is unmeasured and the two new bounds carry 140x/250x margins | `83dfc19` | Positional rows added; the wide-margin bounds are now a backstop rather than the only signal. |
| 20 | **major** | The §5.1 "`--write` requires a log entry" friction was documented, not built | `6f563ae` | --write friction built. |
| 22 | **major** | The manifest cannot grow with the library — new library files outside four fixed dir/extension pairs are invisible to all three ratchets and to Unit 8's move list | `6f563ae` | Globs widened and blind spots printed (D27). |
| 23 | **major** | Tier B goldens nothing that can detect a layout regression: invariants 3 and 4 are printed to stderr only, and the two goldened "collapse detectors" have 2-3 orders of magnitude of slack | `83dfc19` | Layout-sensitive rows added. |
| 24 | **major** | The fifth §5.1 executable-friction mechanism (`--write` requires a log entry) was written as a comment, not built, and the omission is not logged | `6f563ae` | Built, and logged as D26/D28. |
| 25 | **major** | Gates 4 and 6 are extension-scoped: a .ts file under src/components/controls/ escapes both ratchets entirely | `6f563ae` | Extension set widened (D27). |
| 28 | **major** | The fifth §5.1 executable friction — `--write` requires a log entry — was not built, only described | `6f563ae` | --write friction built. |
| 29 | **major** | `--write requires a log entry` is prose only — the one executable friction Unit 0 did not build, and its absence is unlogged | `6f563ae` | Same mechanism. |
| 31 | **major** | T7's third nuance — a node with no sourceFile is always visible — is invisible to every golden | `83dfc19` | syntheticVisible covers it. |
| 33 | **major** | The goldens are blind to the entire global force-parameter table (DEFAULT_PARAMS scalars) | `83dfc19` | DEFAULT_PARAMS goldened. |
| 34 | **major** | T7's absent-sourceFile policy is unreachable from every fixture and has no synthetic coverage | `83dfc19` | syntheticVisible covers it. |
| 6 | **minor** | The forbidden-pattern check is defeated by a type alias, a wrapped Record, a bound `Math.random`, and a double-quoted fallback | `6f563ae` | Bound Math.random and double-quoted fallbacks closed (D28). Type-alias and wrapped-Record evasion remain open — recorded as a known limit below. |
| 7 | **minor** | §8.4's Unit-0 exception was half-applied for D21 and D24: neither contradiction was raised as an Open Question | `149634c` | Raised as OQ3 and OQ4 in PROGRESS.md, as §8.4 requires alongside the DECISIONS entry. |
| 13 | **minor** | Three of the five force kernels, plus `seedAt`, are executed by no golden at all — including 4 of the 9 RNG sites Unit 0c was commissioned to inject | `83dfc19` | All five kernels are probed directly, including the radial branch and both seedAt draws. |
| 21 | **minor** | Gate 6 misses a barrel import of the shim (`from '../adapter'`) — the exact import shape Unit 2 creates | `6f563ae` | Segment matching catches the barrel import. |
| 27 | **minor** | Three of the five force kernels never execute under any gate, including the radial path T1 singles out as the subtle one | `83dfc19` | Force probes execute every kernel. |
| 32 | **minor** | PROGRESS.md's Budget and Gate-state tables still describe the pre-Unit-0 tree and contradict HEAD | `149634c` | PROGRESS.md Budget, Status, Counters and Gate-state tables updated at the unit boundary. |

## The one defect behind five of the blockers

Findings 2, 11, 18, 26 and 30 are five faces of a single mistake, and it was
mine. D24 set out to avoid goldening a chaotic float-derived count — correct
reasoning — and over-corrected into goldening **nothing that depended on the
layout at all**. Reproduced before fixing: commenting out `applyBandGravity`
entirely left all seven goldens matching. Reviewers independently demonstrated the
same thing by swapping the constructor's two jitter draws, by replacing the seeded
generator with `Math.random`, and — the sharpest probe — by seeding every node
outside its band, the exact T2 failure mode, which pushed `stress-sample` from
3/53 to 51/53 nodes out of band with every gate still green.

The fix keeps D24's stability reasoning and narrows the comparison rather than
abandoning it: tick 0 is bit-exact, a three-tick run stays far below the rounding
grid, and the kernels are additionally probed directly. That last piece is also
where T3 finally gets a detector — `tick()` sanitizes non-finite velocities, which
had made the post-tick "no NaN" assertion a tautology.

## Findings judged and NOT actioned

- **Finding 6 (partially).** A `type R = Record<string, X>` alias, or a `Record<>`
  wrapped in a helper generic, still evades the forbidden-pattern check. Closing
  it properly needs type information, which means a typechecked linter, which
  means a dependency (C2 → §8.3). Recorded as a known limit rather than papered
  over; see `PROGRESS.md` F9.
- **Finding 12.** `ticksToStable` really does carry no information about the graph
  or the forces — it is arithmetic on `alpha` alone. It is kept as a cheap
  structural check, not as the settle detector; the short-run position rows are
  the detector now.
