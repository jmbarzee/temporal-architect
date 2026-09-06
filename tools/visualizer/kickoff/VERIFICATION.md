# Verification & Validation

**§3 of the kickoff set. Protocol is [immutable]. Results are [living].**

> Read this before `PLAN.md`. The verifier is designed before the plan on purpose:
> a unit that cannot be checked mechanically is mis-cut, and you will only find
> that out by trying to write its check first.

---

## 3.0 Why this section exists at all

`tools/visualizer/` has, as of kickoff:

| gate | state |
|---|---|
| Tests | **none**. No runner in `package-lock.json`, no `test` script, no `*.test.*` file |
| Lint | **none**. `// eslint-disable-line` comments exist in `useSimulationLoop.ts` for a linter that was never installed |
| CI typecheck | **none**. `make build` → `build-visualizer-lib` → `npm run build:lib` → vite only. `npm run build` is the only script that runs `tsc`, and nothing invokes it |
| Dev app | excluded from the dts graph (`vite.lib.config.ts` `exclude`), so a broken `App.tsx` ships green |

Every behavior this refactor must preserve is therefore currently protected by
nothing at all. §3.1 is the first unit of work, and no other unit may begin
before it lands.

---

## 3.1 Executable criteria

Six gates. **Gates 1–4 and 6 must pass at every commit boundary. Gate 5 is per
PR.** (`PLAN.md` §6.1 restates this as the unit test; the two must agree.)

### Gate 1 — typecheck

```
cd tools/visualizer && ./node_modules/.bin/tsc --noEmit
```

~1.6s, exits 0 today. `tsconfig.json` sets `strict`, `noUnusedLocals`,
`noUnusedParameters`, `noFallthroughCasesInSwitch` — a genuinely strong gate for
a file-splitting refactor. `include` is `["src"]` only.

**Unit 0 wires this into `make` and CI.** Cheapest win available: it already
passes.

### Gate 2 — build

```
cd tools/visualizer && npm run build:lib
```

~2.3s. Note T31: `rollupTypes: true` is a silent no-op in the installed plugin.
Consumers are unaffected, but do not believe the config comment about bundled
types.

### Gate 3 — goldens

```
cd tools/visualizer && npm run verify
cd tools/visualizer && npm run verify -- --write   # regenerate; see §8.2 and the tripwire rule
```

Unit 0 wires `verify` into `Makefile` and `ci.yml` alongside Gates 1 and 6.

### Gate 4 — leak gate

```
cd tools/visualizer && npm run leak-gate
```

Counts Temporal-domain vocabulary across an explicit **file manifest**. The
pattern, the manifest, and the per-unit ceilings are in `PLAN.md` §6.5 and are
[immutable] — the gate script implements them, it does not define them.

### Gate 5 — browser pass (per PR)

Not automated; do it yourself, do not ask a human to.

```
cd tools/visualizer && npm run dev
# then: http://localhost:5173/?ast=/fixtures/<fixture>.json
```

**Pass criteria** — all must hold for every committed fixture:

1. Graph tab renders nodes and edges; the canvas is not frozen or blank
2. `Fit` frames the graph
3. All Controls tabs open, and every chart/plot draws
4. Toggling each filter chip changes the visible set and the layout reheats
5. The browser console shows no uncaught error
6. Screenshot saved to `kickoff/screenshots/<unit>-<fixture>.png`

Frozen canvas is the specific failure this gate exists for (T4): a green golden
with a hung canvas is a pass on Gates 1–4 and a failure here.

### Gate 6 — import direction

```
cd tools/visualizer && npm run boundary-gate
```

No file in the §6.5 manifest may import from `src/adapter/`, `src/theme/`,
`src/types/ast`, `src/types/parser-graph`, `src/types/decomposition`, or
`src/components/blocks/`. Without this, Gates 1–4 all stay green while the
library-to-be quietly depends on the shim — the leak gate counts *vocabulary*,
not *dependencies*. Ratchets like Gate 4: violations may only decrease.

---

## 3.1.1 The golden harness

**A characterization harness, not a correctness one.** It captures what the code
does today, with no opinion about whether that is right. Known defects are locked
in *as documented defects*; un-locking one is a deliberate golden diff under
§8.2, never an accident.

### Runner — no new dependencies, and no node typings

C2 forbids new dependencies, and **`@types/node` is not installed** (T33). So the
harness is split in two:

- **`src/verify/main.ts`** — typechecked (it is under `src/`), pure computation,
  and its only output is `console.log(JSON.stringify(snapshot, null, 2))`.
  `console` comes from the `DOM` lib, so this needs no node typings. It touches
  no filesystem and reads no `process.argv`. Fixtures reach it as JSON imports.
- **`verify/run.mjs`** — plain JavaScript at the package root, **outside**
  `tsconfig.json`'s `include`, so it is never typechecked. It spawns the bundled
  program, reads the committed golden, diffs, handles `--write`, and sets the
  exit code.
- **`vite.verify.config.ts`** — ~30 lines. `lib.entry: src/verify/main.ts`,
  `formats: ['es']`, and **`lib.fileName: () => 'verify.js'`** (without it, vite
  names the output from the package name and the run step fails with
  `MODULE_NOT_FOUND`), `outDir: 'dist-verify'`.

```
"verify": "vite build --config vite.verify.config.ts && node verify/run.mjs"
```

Add `dist-verify/` to `.gitignore` beside `dist-lib/`.

### Golden layout

`kickoff/goldens/` — one file per fixture plus one for the synthetic table:

```
kickoff/goldens/<fixture>.golden.json     # Tier A + Tier B for that fixture
kickoff/goldens/edge-types.golden.json    # Tier C, fixture-independent
```

Stable key order everywhere (sort object keys on emit, sort arrays by id) so a
diff is legible. Round all floats to 6 decimal places.

### Tier A — exact goldens (structural, discrete)

Byte-identical, or the unit's `**Goldens:**` line permits the change and the
commit body explains every changed line.

| subject | captured |
|---|---|
| `buildGraph` | node list (id, dimensions, name, sourceFile, parentId, orphan, definitionKey, templateParams) sorted by id; edge list sorted; `duplicateGroups` |
| edge classification | per-edge resolved `EdgeTypeId`, plus a histogram |
| `reconcileFilter` | the full transition matrix: both intents × pinned/unpinned × every dimension |
| visible subgraph | per filter state: visible node ids, graduated edge list with resolved endpoints, `nodeSummaries`, `downstreamScores` |
| `edgeStyleFor` | per-edge resolved style key (§3.1.2 requires lifting it out of `GraphCanvas` first) |
| **filter-set identity** | for a scripted sequence of per-dimension filter edits, which dimension `Set`s changed identity at each step. Expected: an edit to dimension X leaves every other dimension's `Set` reference untouched. **This is the only detector for T5**, which is otherwise invisible to every other tier |
| generated CSS | the full text `buildNodeTypeCSS()` emits. A vocabulary grep cannot see custom-property *names* that are correct-but-Temporal, and cannot see this file at all once the ratchet reads 0 — this row can |

**On the filter matrix:** `spec/GRAPH_VIEW.md` § Edge Graduation ships a table of
six named filter combinations. Use those six as the matrix's **inputs**. Its
Nodes/Edges columns are prose categories ("Namespaces", "NS→NS dependencies"),
not expected values — the golden records what the code actually resolves. Add the
empty-set case and the per-file cases.

### Tier B — invariants, not positions (the simulation)

`Math.pow`, `Math.hypot`, and the trig functions are not guaranteed bit-identical
across V8 versions or platforms, so a position snapshot would be flaky between a
dev machine and CI. And positions differing by 0.3px does not matter; the layout
*collapsing* does.

Fixed parameters, committed alongside the goldens so a re-run is reproducible:

| parameter | value |
|---|---|
| RNG seed | `0x5eed` (mulberry32) |
| tick count | 400 |
| band tolerance | 5% of band height |
| settled threshold | mean speed < `alphaMin` × 10 |

Assertions:

1. **No `NaN`** in any position or velocity. The only detector for the
   missing-key → `undefined`/`NaN` path (T3).
2. **`bandCenters(active, params).length` equals the number of distinct dimension
   values present in the active set.** The single most important assertion here —
   see T1.
   **Assert the count of entries collected, not the count of distinct centre
   *values*.** Several types deliberately share a band, so with all 7 types
   present there are only **4** distinct centre values. Asserting distinct values
   gives a permanently-red gate.
   This requires production surgery — see §3.1.2 item 5.
3. Every node inside its band, or within tolerance of it.
4. Mean speed below the settled threshold after the tick count.

**Self-test invariant 2 the way Tier C is self-tested:** deliberately key the
band collection by node identity instead of by the interned value, confirm the
invariant goes red, and revert. An invariant that has never failed is an
invariant you have not verified.

### Tier C — the synthetic `edgeTypeFor` table

**`linkSignalSend` is unreachable from any fixture in the repository.** Verified
by running `twf graph --json` over all 16 `.twf` files under `examples/` and
`skills/`: the edge kinds that appear are `containment`, `activityCall`,
`workflowCall`, `nexusCall`, `nexusRoute`, and `asyncBacking`. `signalSend` never
appears.

That is the rule whose *precedence* is most load-bearing — checked before every
node-type rule at `edge-types.ts:129`, because both endpoints are `workflow` and
nothing else separates a fire-and-forget send from a child-workflow call.

So: **synthesise an edge for every reachable combination** of `(edgeType,
sourceNodeType, targetNodeType, dispatchKind)` — 2 × 7 × 7 plus the `signalSend`
variants, ~200 rows — and golden the resolved id for each. It fully pins the
fall-through order, both catch-alls (`:124`, `:137`), and the `Op↔Op → Wf→Op`
conflation (`:134`).

**Self-test the harness:** before committing the Tier C golden, deliberately swap
two rules in `edgeTypeFor` and confirm the gate goes red. Revert. Unit 0 is not
done until you have seen it fail.

### Fixtures

`public/fixtures/decomposition-sample.json` is nearly useless for the risky
paths. Measured: 37 parser nodes, 105 edges, **0 coarsened edges**, **1 source
file**, only 4 of 7 node kinds, no nexus. It cannot exercise operation splicing,
nexus routing highlight, `coarsenedEdgeToViewEdge`, or the file dimension.

**A fixture is a composite envelope and no single command produces it.**
`twf graph --json` emits `{summary, diagnostics, graph}` whose nodes carry only
`id` and `definition` — **no `sourceFile`, no AST**. `normalizePayload`
(`src/types/payload.ts:104-106`) routes that shape to an *empty* AST, which
silently breaks `sourceFile` (`build.ts:145` reads it from the AST) and therefore
the whole file dimension. Build fixtures like this instead:

```
python3 - <<'EOF' > public/fixtures/nexus-sample.json
import json, subprocess
F = ["skills/temporal-architect-design/topics/nexus.twf"]
run = lambda a: json.loads(subprocess.check_output(a, text=True))
print(json.dumps({
  "ast":           run(["twf", "parse", *F]),
  "parserGraph":   run(["twf", "graph", "--json", *F])["graph"],
  "decomposition": run(["twf", "graph", "chunks", "--json", *F])["chunks"],
}, indent=2))
EOF
```

All three commands accept **multiple files** (verified). `twf parse` has no
`--json` flag — it is always JSON.

**Acceptance for the multi-file fixture:** it is not done until at least two
distinct, non-empty `sourceFile` values appear across its nodes. An empty AST
half is the silent failure this recipe exists to prevent — and it also flips
`historyMode` (`WorkflowCanvas.tsx:145`), which disables the Tree tab and makes
Gate 5's "walk every tab" impossible.

Generate and commit:

| fixture | source | why |
|---|---|---|
| `nexus-sample` | `topics/nexus.twf` | all 7 node kinds, 6 coarsened edges, `nexusRoute` + `asyncBacking`, 5 namespaces |
| `taskqueues-sample` | `topics/task-queues.twf` | all 7 kinds, **7 coarsened edges** — the densest coarsening case |
| `stress-sample` | `examples/human-in-the-loop-access-control/access-control.twf` | 53 nodes / 156 edges — graduation and performance stress |
| `multifile-sample` | `topics/nexus.twf` + `topics/task-queues.twf` | 74 nodes / 103 edges / 13 coarsened across **two** source files — the only fixture that can exercise the `sourceFile` dimension |

Keep `decomposition-sample.json`.

### Golden size

Roughly 30–50KB per fixture if per-filter-state entries carry counts, sorted id
lists, and the graduated-edge list rather than re-dumping full node objects. Dump
node objects once per fixture.

A committed 40KB JSON sounds heavy until you are reviewing a PR where three lines
of it changed.

---

## 3.1.2 Production code the harness requires

The harness is **not purely additive**. Unit 0 must make the core callable:

1. **`reconcileFilter` is already exported** (`src/filter/reconcile.ts:21`). No
   change.
2. **Four of the riskiest functions are module-private inside a hook file** —
   `findNearestVisibleAncestor` (`:24`), `resolveDepEndpoint` (`:44`),
   `computeDownstreamScores` (`:76`), `computeGraphNodeSummary` (`:150`) — and
   the graduation loop lives inside the `React.useMemo` body of
   `useVisibleGraph` (`:222`). Lift a pure
   `computeVisibleGraph(nodes, edges, filter, ontology): VisibleGraph` out and
   reduce the hook to a `useMemo` wrapper. Later units need this regardless.
3. **Nine `Math.random()` call sites** must take an injected RNG:
   `forces.ts:105`, `:162`, `:281`, `:282`; `simulation.ts:273`, `:274`, `:289`,
   `:428`, `:429`. **The production default stays `Math.random`** — only the
   harness injects a seed, so app behavior is unchanged and no user-visible
   determinism is introduced (`DECISIONS.md` D11).
4. **`edgeStyleFor` must be lifted out of `GraphCanvas.tsx:164-207`** into a pure
   module. It is already pure. Since it and `edgeTypeFor` are two independent
   classifiers that already disagree (**T11**), having both under golden is
   exactly what makes unifying them safe in Unit 6.
5. **Export a `bandCenters(active, params): number[]`** from `forces.ts` and have
   `medianBandCenter` (`:195-208`) delegate to it. `medianBandCenter` is
   module-private and returns a single number, so Tier B invariant 2 is
   unobservable without this. Assert against the **exported production
   function** — never against a harness re-derivation, which would pass while
   production diverged.

---

## 3.2 Independent validation loop

Fresh sub-agents exist to break the orchestrator's context lock. The contract is
non-negotiable.

**Inputs.** A validating agent receives the criteria and the raw artifact —
diff, files, command output — and *nothing else*. Never the orchestrator's
summary. An inherited narrative reintroduces the lock the fresh context was
spawned to break.

**Isolation.** No shared context with the producing session. A validator is
always a new agent, never a continuation.

**Findings are blocking.** Severity-tagged (`blocker` / `major` / `minor`),
written to `kickoff/reviews/REVIEW_<unit>.md`, processed before the next unit
begins.

**Enforcement.** A unit is not complete until `kickoff/reviews/REVIEW_<unit>.md`
exists and every `blocker` and `major` in it is marked resolved with the commit
sha that resolved it. `PLAN.md` §6.1 carries this as a gate; `PROGRESS.md`'s
completed-units row links to the file. An absent review file is an incomplete
unit, not a fast one.

**Cadence.** Two scopes:

| scope | author | reviewer | who handles feedback |
|---|---|---|---|
| **PR** | always a fresh sub-agent (for the PR's first commit) | fresh sub-agent, skeptically seeded | the **root orchestrating agent** |
| **commit** | orchestrator's choice: fresh, or the agent that wrote the previous commit | fresh sub-agent | the **sub-agent that performed the edits** |

The asymmetry is deliberate. PR-level feedback may require re-planning, which is
the orchestrator's job. Commit-level feedback is local repair, which the author
does with its context still warm.

**How these agents get spawned** — individual sub-agent calls or an orchestrated
fan-out — is §3.5. The contract above binds either way; §3.5.1's prohibition on
fanning out *authoring* is [immutable] and applies regardless of mechanism.

**Skeptical seed for PR reviewers.** Give them, verbatim:

> Assume this change is subtly wrong. The author had every incentive to declare
> victory. Your job is to find the thing they talked themselves out of checking.
> Start from the golden diff and the leak-gate count, not from the description.

---

## 3.3 Spirit checks

Adversarial review targeting letter-vs-spirit gaming. This work invites five
specific cheats; name them to the validator:

1. **Widening a tolerance instead of fixing the drift.** Any change to a Tier B
   parameter is a `blocker` unless it is the unit's stated purpose.
2. **Renaming a literal to pass the leak gate.** `'workflow'` → `'kind_a'`
   satisfies the grep and defeats the point. The test is whether a non-Temporal
   consumer could supply that value.
3. **Keeping `nodeType` as a convenience field "for now."** This is how the
   refactor silently never completes.
4. **Regenerating goldens as the first response to a red gate.** The default
   response is to understand it.
5. **Satisfying Gate 4 while failing Gate 6** — moving vocabulary out while
   leaving the import edge in. The two gates exist as a pair.

Ask the blunt question: *does this satisfy the check while missing the point?*

---

## 3.4 Regression discipline

Every defect found — by a gate, a validator, or the browser pass — gains a
permanent check before the fix counts as done:

- behavioral defect → a Tier A golden row or a Tier B invariant
- leak → a leak-gate pattern entry (§8.2) or a manifest entry
- import-boundary violation → a Gate 6 rule
- type-level defect → the type change that makes it a compile error

A fix without a check is not a fix; it is a fix-shaped diff. `PROGRESS.md` records
the check alongside the defect.

---

## 3.5 Orchestration: how the sub-agents get spawned

**The §3.2 contract is binding. The mechanism is not.** Isolation,
criteria-and-artifact-only inputs, and blocking findings hold whether each
reviewer is an individual sub-agent call or an agent inside an orchestrated
workflow. Nothing below relaxes §3.2; it only says which shape is worth reaching
for.

Read this section before your first review, and record your choice per §3.5.4.

### 3.5.1 Never fan out authoring — [immutable]

**Code is authored by exactly one agent at a time.** The unit chain in `PLAN.md`
§6.2 is strict, and five of the hardest files are split *mid-file*
(`useVisibleGraph`, `useHighlight`, `WorkflowCanvas`, `GraphCanvas`,
`node-types`). Parallel authors would conflict constantly, and per-agent git
worktrees do not rescue it — the work has to merge into one tree regardless.

This applies even where an orchestration tool is available and a standing
instruction encourages using one by default. **That standing instruction does not
reach authoring in this run.** If a unit looks parallelisable, re-read §6.1: a
unit that could be split into genuinely independent authored pieces is two units,
and should be re-cut (§6.3) rather than fanned out.

Verification, by contrast, fans out freely — everything below is read-only.

### 3.5.2 Where an orchestrated workflow beats N individual sub-agent calls

Four places. Each names the specific advantage, because "more agents" is not one.

**(a) PR-scope review — diverse lenses on one artifact, concurrently.**
A unit's full diff reviewed simultaneously by six blind lenses: correctness,
each of the four §3.3 cheats, and leak/boundary. *Advantage over N calls:* one
schema-validated result instead of six free-text returns to reconcile by hand,
and — the real one — **redundant reviewers converge on the same finding while
diverse lenses do not**. Six agents asked "review this" produce one finding six
times; six agents each given a distinct lens produce six.

**(b) Spirit checks (§3.3) — one agent per named cheat.**
*Advantage:* attention. A single reviewer asked to check four cheats checks the
first one well. Four reviewers each checking one check all four well. Cheap —
four agents per unit.

**(c) Milestone Counter A audit — the highest-value fan-out in the run.**
Twenty of the 42 requirements are provable only by Gate 5, the manual browser
pass. That is the weakest joint in the whole denominator and the one place
self-grading is structurally unavoidable (KICKOFF §2.1 says so outright). At
Units 4, 6 and 8, run one adversarial agent per claimed-done requirement — given
the requirement text, the committed screenshot, and the diff, and prompted to
**refute**, not confirm.
*Advantages over N calls, and there are four:*
- a **pipeline** needs no barrier — requirement 1's second opinion runs while
  requirement 20 is still being audited
- **schema-validated verdicts** update the counter mechanically instead of by
  reading prose
- **resume from cache** if the session dies mid-audit — which matters here more
  than anywhere, because §7.1 declares every session killable and a 20-agent
  audit is the longest single operation in the run
- **batching**, since 20 exceeds a default size guideline and a script handles
  the queueing that a human-driven sequence of calls would not

**(d) Blast-radius sweep at unit close — one read-only verifier per B-row.**
"Is B23 actually migrated, or merely marked?" *Advantage:* a barrier is correct
here (you want every verdict before closing the unit), and a per-row schema
verdict writes straight into §6.4's status column, so Counter B stops being
self-reported.

**(e) Unit 9 spec sweep — multi-modal search.**
Agents each searching the four spec documents a *different* way: by section, by
vocabulary, by cross-reference to the code. *Advantage:* one search angle will
not find everything. T29's `level` / `tier` / `ladder` contradiction survived in
the spec precisely because every previous reader approached it the same way.

### 3.5.3 Where a single sub-agent is the right shape

- **Commit-scope review.** Commits within a unit are sequential — each builds on
  the last, and a blocker found in commit N invalidates work already layered on
  it. One fresh sub-agent per commit, in order. Pipelining buys nothing and
  risks reviewing a base that is about to change.
- **PR authoring.** Always exactly one fresh sub-agent (§3.2, §3.5.1).
- **Any one-off question** a gate cannot answer.

### 3.5.4 Record the choice

At the start of the run, append a `DECISIONS.md` entry naming which mechanism
you are using for §3.2's reviews and which of §3.5.2's fan-outs you will run.
Otherwise the run's throughput is set by an invisible launch condition and no
later session can tell what happened — the same legibility problem §7.4 exists
to prevent.

### 3.5.5 Cost discipline — [added mid-run, Unit 0 boundary]

§3.5.2 says which *shape* is worth reaching for. It does not say how big, and
Unit 0's fan-out was measured: **51 agents, 6.24M subagent tokens, 34 confirmed
findings — which collapse to 4 distinct defects.** A ~7× redundancy factor, and
nine of the eleven lenses independently found the same central one.

That review was worth its cost: it caught a harness that goldened nothing
dependent on the layout, which would have survived until Unit 5a or 6 with four
units of physics work layered on top of it. The lesson is not "fan out less" —
it is that almost all of the spend went somewhere other than the finding.

Five rules, derived from that measurement:

1. **Five or six finders, not eleven.** Give each a genuinely orthogonal mandate.
   Redundant reviewers converge; that convergence is not extra coverage, it is
   the same finding paid for repeatedly.
2. **Instruct every finder to break the code and show the gate output.** This was
   the single highest-leverage line in Unit 0's prompt. Reviewers who broke
   something and watched a gate stay green produced findings; reviewers who
   reasoned analytically produced restatements of the description.
3. **Cluster findings yourself before verifying.** Free, and it is what turns 34
   into 4.
4. **Verify clusters, not findings, and verify them cheaply.** A verifier needs
   the claim and the file it anchors to — not the criteria set. Unit 0 handed all
   ~40 verifiers the full "read these five documents" preamble, which is where
   most of the 6.24M went. Use a tight prompt and a cheaper model (`opts.model`,
   `opts.effort`); neither was used at all in Unit 0.
5. **Commit-scope review only where behavior changes.** A plumbing, doc, or
   pure-move commit already has a reviewer: the goldens. Unit 0 spent 144k tokens
   reviewing a 13-line Makefile change and got three minors back.

And one about authoring: §3.2's cadence table has a PR's first commit authored by
a fresh sub-agent. For a commit under ~50 lines that is net-negative — Unit 0's
delegated 0a cost 80k tokens for a diff writable in one tool call, left a stray
build artifact behind, and had to be reviewed anyway. Delegate authoring when the
commit is large enough that a fresh context is actually worth building.

**Where to keep spending.** The first review of any unit that touches the force
model or the gates themselves — Units 4, 5a, 5b and 6. That is where a blind spot
is most expensive, and Unit 0 is the proof: the defect was in the verifier, and
the author could not see it because the author had written the rationale for it.

Expected shape after this: roughly 700k–900k per unit rather than 6.6M.

At the start of the run, append a `DECISIONS.md` entry naming which mechanism
you are using for §3.2's reviews and which of §3.5.2's fan-outs you will run.
Otherwise the run's throughput is set by an invisible launch condition and no
later session can tell what happened — the same legibility problem §7.4 exists
to prevent.
