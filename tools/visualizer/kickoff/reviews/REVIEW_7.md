# Review — Unit 7 (post-filter-scoped controls; the last three behaviours injected)

**§3.2 review record. PR scope.** Fourth run under rule 12: five finders
(Opus on the model and the gates, Sonnet elsewhere) in isolated worktrees
told the sha and detaching to it (every one started at main and said so), a
Sonnet grouper that only groups, severity and the verify trigger computed
from the finders' own claims.

**33 findings, 32 reproduced** (as filed: 13 blocker, 13 major, 7 minor),
across **9 clusters**, **9 verified, 0 refuted** — all six filed-blocker
clusters downgraded to major (four confirmed outright, two "partly"), one
major confirmed, two downgraded to minor. **15 agents, 2.44M subagent
tokens, 912 tool uses, 21.1 minutes.**

Every cluster at blocker or major is resolved in `a57ad8b` (D60); the one
minor left undone is filed
([#176](https://github.com/jmbarzee/temporal-architect/issues/176)).

## The rules, measured

| | Unit 3 | Unit 4 | Unit 5a | Unit 5b | Unit 6 | Unit 7 |
|---|---:|---:|---:|---:|---:|---:|
| agents | 15 | 24 | 14 | 15 | 18 | **15** |
| tokens | 1.86M | 3.52M | 2.14M | 2.27M | 2.66M | **2.44M** |
| findings → clusters | 42 → 20 | 55 → 26 | 39 → 11 | 39 → 16 | 42 → 17 | 33 → **9** |
| clusters verified | 8 of 20 | 17 of 26 | 8 of 11 | 9 of 16 | 12 of 17 | **9 of 9** |
| refuted | 1 | 0 | 0 | 0 | 0 | **0** |
| blockers downgraded by verification | — | 5 of 7 | 3 of 5 | 1 of 1 | 2 of 2 | **6 of 6** |

The tightest clustering yet — nine mechanisms from thirty-three findings,
five finders landing on the same memo (C1) and the same recursion (C3) —
and every cluster needed verifying, because thirteen findings were filed at
blocker and seven contradicted D59. None of the six blockers survived at
blocker, and none was refuted either: each was a real defect whose reach
the finder had overstated. Two of them D59 had **ratified**: the endpoint
highlight compared the parser's routing id to the node's bare name and so
never lit a call, and the unit's new `hookedHighlights` rows pinned that
empty answer as the golden (C2); and D59 §2's "the spliced one keeps
precedence is what the old rule meant" was false — the new rule was
last-wins among spliced edges, agreeing with the old payload rule only in
the parser's edge order, which the verifier showed by reversing it (168 of
640 states differ; C4). Both are F24 again, and the second has a sharper
shape: a golden written from the implementation pins whatever the
implementation does, including a dead branch.

The structural finding is C5 with C9 behind it. Tier A's `controls` rows
re-derived R35 inside the harness, so the view could read the whole graph
and every gate stayed green — the verifier did exactly that, six view-side
sabotages in one run, all green — and the view *was* reading the wrong
edges: pull tokens were classified over the graduated edges the canvas
draws, which the simulation never springs, so the `linkWorkflowToWorkflow`
token under the default filter moved nothing (its six edges all graduated,
zero displacement under an override). The fix for both is one rule: the
harness calls the function the view calls (`presentSetsOf`, `highlightOf`,
`sprungEdges` stated once in the simulation), and a server render counts
what the components actually offer (F25).

| lens | findings | reproduced | blocker / major / minor |
|---|---:|---:|---|
| injection | 4 | 4 | 3 / 1 / 0 |
| controls | 5 | 5 | 3 / 0 / 2 |
| gates | 7 | 6 | 3 / 3 / 1 |
| model | 8 | 8 | 2 / 4 / 2 |
| record | 9 | 9 | 2 / 5 / 2 |

## Clusters, as computed (severity = max filed; verdict where verified)

| cluster | severity | verdict | members | mechanism | resolution |
|---|---|---|---|---|---|
| C1 stale-curves | blocker | confirmed (major) | injection-1, controls-1, gates-1, model-1, record-1 | ChargeCurves' useMemo dependency list omits the `present` / `shown` set derived from the visible set, so curves go stale after a filter toggle while ChargeMap updates. | the memo keys on the present set; Gate 5's `--toggle` fails a capture whose counts do not change, and the by-hand pass opens the panel first — tokens 20 → 10, curves 22 → 12 (D60 §1) |
| C2 dead-endpoint-highlight | blocker | confirmed (major) | injection-2, gates-2 | highlightFor compares the routing nexusEndpoint node id to the endpoint's bare name, so the match never succeeds and no call edges are highlighted, and the new golden rows pin that empty result. | compares the id; every `hookedHighlights` row now carries the whole highlight through `highlightOf`, and the endpoint's edges populate (D60 §2) |
| C3 splice-recursion | blocker | confirmed (major) | injection-3, model-4, record-6 | resolveDepEndpoint recurses through hidden 'splice' nodes with no visited set, so a dependency cycle overflows the stack now that any value may declare whenHidden splice. | a hidden node is passed through once per resolution; `hiddenPolicy.cycle` pins the chain; `createOntology` refuses a policy outside its two values, `schemeProbes.refusals.badWhenHidden` (D60 §3) |
| C4 order-dependent-precedence | major | confirmed (major) | injection-4, controls-5, gates-3, model-3, record-4 | Splice collision precedence is a boolean 'was spliced' flag rather than the old nexusEndpoint-payload rule, so between two spliced edges the last one wins, it agrees with the old rule only for the parser's edge order, and D59's equivalence claim is false. | precedence reads whether an edge carries metadata, in either order — `hiddenPolicy.collisionCallFirst` and `collisionCallLast` both answer `meta=route`; D59 §2 corrected; every fixture graduated-edge row still byte-identical (D60 §4) |
| C5 view-wiring-unpinned | blocker | partly (major) | controls-3, gates-4, gates-7, model-2, model-6, record-2, record-3, record-9 | The R35 and B35 view-side wiring (GraphView present memo, panel and component filters, useHighlight merge, matchesFocus, tooltip contextLine) is exercised by no gate, because Tier A rows re-derive the behaviour in the harness and the screenshot capture does not assert a change. | `presentSetsOf` and `highlightOf` are the one function the view and Tier A each call; `static.viewProbes` server-renders both force tabs under three states and counts what they offer against the sets, and pins `matchesFocus`; `--toggle` asserts a change (D60 §5) |
| C6 gates-keyed-on-spelling | blocker | partly (major) | gates-5, gates-6 | The quality gates (boundary and pattern) key on specific import paths and spellings and exclude host components and src/verify, so violations pass undetected. | an import resolving to a shim component counts — measured 8, ceiling 6 → 8 with the reason; the pattern gate's spelling and the harness's exclusion left as they are, recorded (D60 §6) |
| C7 prose-and-two-presents | major | partly (minor) | controls-4, model-5, record-7, record-8 | D59's scope change was not carried through the prose and decision record: the spec, comments, dropdown counts and DECISIONS entries still describe or imply whole-graph versus visible-set 'present' inconsistently, and nothing tells the user the controls are scoped. | the two sets are named — the frame's over the whole graph (D54), the controls' over the visible set (R35) — in D60, the spec at both places they meet, and the dropdown's title; the two stale comments gone; D51/D54's relation to D59 recorded; the empty state filed as #176 (D60 §7) |
| C8 policy-read-ad-hoc | major | partly (minor) | model-7, model-8, record-5 | Taxonomy and ontology policy is read ad hoc instead of being declared once and validated: whenHidden silently defaults on any miss, the hooks read a second style-axis constant, and one focus fact is stored in two shapes with conversions. | `whenHidden` refused outside its two values; one focus shape (`FocusTarget`, `CrossViewTarget` deleted); the hooks keep reading the host's own axis constant, from which `styleDimension` is assigned (D60 §3, §8) |
| C9 tokens-over-unsprung-edges | blocker | confirmed (major) | controls-2 | Pull tokens are classified over graduated (spliced or ascended) edges that the simulation never applies springs to, so some tokens tune nothing. | `sprungEdges` stated once in the simulation and read by the controls; `controls.springs` rows move where a category was held only by graduated edges (D60 §5) |

## Findings, as filed

- **injection-1** [blocker] ChargeCurves memo ignores the visible set: after a filter toggle the falloff read-out keeps the previous set's curves — `src/components/ChargeControls.tsx:145`
- **injection-2** [blocker] Endpoint highlight compares the routing id to the node name, so it never lights a call, and Unit 7's new golden rows pin that — `src/adapter/node-types.ts:460`
- **injection-3** [blocker] Splice recursion has no visited set: a valid .twf with sync ops that nexus-call each other crashes the Graph view at the default filter — `src/components/graph-view/visibleGraph.ts:88`
- **injection-4** [major] 'Spliced keeps precedence' is not the old 'keep the nexusEndpoint edge' rule; the one golden case where they differ cannot see it — `src/components/graph-view/visibleGraph.ts:241`
- **controls-1** [blocker] ChargeCurves memo omits the scoped bucket set: toggling a chip drops the tokens but the falloff curves stay — `src/components/ChargeControls.tsx:145`
- **controls-2** [blocker] Pull tokens are classified over graduated edges, which the simulation never applies a spring to: dragging them does nothing — `src/components/GraphView.tsx:260`
- **controls-3** [blocker] R35 wiring in GraphView and the five consumers is under no gate; the controls golden re-derives the sets in tier-a.ts — `src/components/GraphView.tsx:263`
- **controls-4** [minor] Nothing a user sees says the controls are scoped: dropdown counts stay whole-graph beside fewer tokens, and the all-chips-off tabs are bare frames — `src/components/PushPullControls.tsx:60`
- **controls-5** [minor] Splice collision precedence became edge-order dependent (outside my lens) — `src/components/graph-view/visibleGraph.ts:241`
- **gates-1** [blocker] Push curves do not follow a filter toggle: ChargeCurves' memo leaves out `present` — `src/components/ChargeControls.tsx:145`
- **gates-2** [blocker] Endpoint routing highlight is dead, and Unit 7's new hookedHighlights row ratifies it — `src/adapter/node-types.ts:460`
- **gates-3** [major] Splice precedence depends on edge order; the byte-identical proof holds only in the parser's order — `src/components/graph-view/visibleGraph.ts:241`
- **gates-4** [major] Nothing reads D59's view-side invariants; the new Tier A rows re-derive them in the harness — `src/verify/tier-a.ts:96`
- **gates-5** [blocker] Boundary gate cannot see library-to-host-component edges; D59's 'one violation fewer' can be undone silently — `verify/boundary-gate.mjs:19`
- **gates-6** [major] as-record rule is keyed on spelling; harness casts are outside the gate entirely — `verify/pattern-gate.mjs:43`
- **gates-7** [minor, unreproduced] --toggle capture is not checked against anything — `verify/screenshot.mjs:191`
- **model-1** [blocker] ChargeCurves memo ignores `present`: curves keep the old bucket set after a filter toggle while the map beside them updates — `src/components/ChargeControls.tsx:145`
- **model-2** [blocker] R35's own wiring in GraphView is pinned by nothing: Tier A `controls` re-derives it, so the view can read the whole graph and every gate stays green — `src/components/GraphView.tsx:264`
- **model-3** [major] Edge-collision precedence now depends on the order the parser emits edges; D59's 'faithful injection' claim holds for one order only — `src/components/graph-view/visibleGraph.ts:241`
- **model-4** [major] `whenHidden: 'splice'` recurses without a cycle guard, so a host that declares it on a value whose nodes can call each other overflows the stack — `src/components/graph-view/visibleGraph.ts:88`
- **model-5** [major] 'Present' names two different sets and the spec and comments still name the wrong one: the overlay draws whole-graph buckets while controls (and GRAPH_VIEW.md:561) say visible — `spec/GRAPH_VIEW.md:561`
- **model-6** [major] B35's view-side halves are unpinned: matchesFocus, the highlight hook's explicit-edges merge, and createOntology's default highlight can each be broken with every gate green — `src/filter/types.ts:150`
- **model-7** [minor] `whenHidden` is required by the type but silently defaults at runtime: any string other than 'splice', or an omitted field, is the ascend policy and createOntology says nothing — `src/components/graph-view/visibleGraph.ts:88`
- **model-8** [minor] One focus fact in two shapes with a conversion each way; the shim discards what FocusTarget carries and turns a miss into '' — `src/components/WorkflowCanvas.tsx:404`
- **record-1** [blocker] ChargeCurves memo ignores `present`: a chip toggle drops the map tokens but leaves every curve — `src/components/ChargeControls.tsx:145`
- **record-2** [blocker] R35's wiring is pinned by nothing: reverting it in the view or the panel leaves every gate green — `src/verify/tier-a.ts:96`
- **record-3** [major] B35 hook wiring unpinned: useHighlight, the tooltip's contextLine call and matchesFocus can stop consulting the host with all gates green — `src/components/graph-view/useHighlight.ts:96`
- **record-4** [major] D59 §2 'the spliced one keeps precedence is what the old rule meant' is false: the new rule is last-wins among spliced edges and only agrees because the parser sorts edges — `src/components/graph-view/visibleGraph.ts:241`
- **record-5** [major] The hooks read TEMPORAL_TYPE_DIMENSION, a second reference to the style axis that `styleDimension` already names (D42 again) — `src/adapter/node-types.ts:431`
- **record-6** [major] `whenHidden: 'splice'` is now a taxonomy-wide policy with no termination guarantee; a cycle among hidden spliced nodes overflows the stack — `src/components/graph-view/visibleGraph.ts:96`
- **record-7** [major] Prose the unit edited or promised still says the opposite: 10 spec sentences and 5 code comments contradict R35, D58/D59 or the tree — `spec/GRAPH_VIEW.md:466`
- **record-8** [minor] D59 reverses D51's whole-graph pull tokens and leaves D54's whole-graph overlay as the other half without saying either; #51 and PLAN Unit 7/8 are left unrecorded — `kickoff/DECISIONS.md:1580`
- **record-9** [minor] Gate 5 evidence for R35 covers one of its three control families, and --toggle is not asserted to change anything — `verify/screenshot.mjs:244`

## What did not reproduce

- gates-7 (the `--toggle` capture is checked against nothing) — filed from
  reading the script, not run; its cluster's verifier confirmed the rest of
  C5. Resolved by the assertion anyway, which then caught two fixtures
  (stress, decomposition) on which the Nexus toggle had been a no-op — so
  their Unit 7 captures had been of the pre-filter set. They are retaken
  with the Workers chip (`--only`).

## Notes from the finders

- injection: Detached from 712d1b8 to 79c4390; node_modules symlinked; worktree clean after reverts. Findings 2 and 3 already existed at 3ed12d0, but they sit in code this unit rewrote, and 2 is newly pinned by a golden. Finding 4 has no user-visible effect today because 2 masks it. Checked and clean: the service rule's direct dimensions read gives the same answer for a node with no type; getTransitiveDeps is pure and cheap on an endpoint; WorkflowCanvas always sends a defType ('' fallback), so namesakes of different kinds cannot both match. Two minor comment problems not filed: the visibleGraph.ts header says the splice branch is not yet injected, and useHighlight.ts keeps a stale doc comment above an import.
- controls: Worktree began at 712d1b8; ran git checkout --detach 79c4390 (detached). Symlinked node_modules. All sabotage reverted; git status shows only the symlink. Scratch scripts are in the session scratchpad r7/. Not filed: the canvas overlay (whole graph, D54) draws 5 of 7 Y stripes with no panel column at nexus types:default and 7 at types:none, T12's 'pick one semantics', deliberate. A hover left on a token that unmounts under a resting pointer (graph rebuild) dims all tokens, not reachable by a chip toggle. Zero-column AxisPlot and the scalar plot are fine; nothing throws in any of 1920 states.
- gates: I found HEAD at 712d1b8 and detached it to 79c4390. The golden claim checks out: decoding 3ed12d0 against 79c4390 shows no removed or changed path in any file. Added: Tier A contextLines; per-state controls and hookedHighlights; injection.* graduatedEdges and contextLines; ontologyProbes.hiddenPolicy. edge-types is untouched. The leak count of 4 is honest: TWFFile import plus prop in FilterBar and in GraphView, all wire types and none in comments. But it counts words, so ParserGraph, Decomposition, GroupsModal and protocol go uncounted. Tooltip icons match DEF_TYPE_CONFIGS for all seven values. After all reverts, make check-visualizer is green; the only leftover is the node_modules symlink.
- model: Worktree started at 712d1b8 (main), detached to 79c4390; node_modules symlinked. Gates at clean 79c4390: tsc, verify, leak-gate, boundary-gate, pattern-gate, map --check all matched the baseline; surface-gate, build:lib and dts-gate not re-run. All sabotages reverted (git status clean). Not filed as findings: HighlightGraph versus ReadableGraph (the any-node getNode scope is documented), Highlight.edges? (the type does express absent), whenHidden required versus contextLine optional (per-value fields are consistently required).
- record: Detached: HEAD was 712d1b8 on arrival; ran git checkout --detach 79c4390 and symlinked node_modules. Baseline re-measured at 79c4390: tsc clean, verify 7/7, leak 4/4, total 1091, boundary 6/6, surface 90, map up to date. All sabotage reverted (git status shows only the node_modules symlink); scratch harness removed. Findings 2 and 3 share one combined sabotage run; the pull-token and Gravity captures do not exist, so those wiring paths were never seen in a browser.
