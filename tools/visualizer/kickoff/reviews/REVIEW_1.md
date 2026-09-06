# Review — Unit 1 (Inject the taxonomy)

**§3.2 review record. PR scope.** First unit under the cost discipline of
`VERIFICATION.md` §3.5.5 / SI-1: **five** orthogonal finders rather than
eleven, no separate verification phase, and a schema field that forced every
reviewer to report what it broke and what the gate said.

**26 findings, 24 of them demonstrated by reproduction** (3 blocker, 11 major,
12 minor), for **827k subagent tokens** — against Unit 0's 51 agents and 6.24M
for 34 findings. The leaner shape did not find less; requiring a reproduction
found more per token, and the two sharpest findings are ones no amount of
reading would have produced.

All 3 blockers and all 11 majors are resolved with the sha that resolved them.

| # | severity | finding | resolved by | how |
|---|---|---|---|---|
| 5 | **blocker** | The fourth widened seam has no default and no check: an injected edge resolver silently NaNs the entire link force | `edd7eff` | ABSENT_EDGE_PHYSICS defaults strength/distance, plus an `undeclaredEdgeCategory` probe driving applyLinkForce with a category the param maps do not declare. |
| 16 | **blocker** | edgeCategory — the fourth widened seam — got no default, and driving it with a host taxonomy writes NaN into both endpoint velocities | `edd7eff` | ABSENT_EDGE_PHYSICS defaults strength/distance, plus an `undeclaredEdgeCategory` probe driving applyLinkForce with a category the param maps do not declare. |
| 21 | **blocker** | computeVisibleGraph takes an Ontology but its visibility predicate still resolves through the module singleton — a supplied ontology empties the graph | `edd7eff` | The visibility predicate resolves through `ontology.resolveNodeStyle(node).defType`. Identical for all seven declared types, so goldens did not move. |
| 1 | **major** | The ontology has two independent, unwired resolution paths: components read React context, the Simulation reads a module singleton | `edd7eff` | `useSimulation` supplies the context ontology, and `Simulation`'s parameter is now REQUIRED — the default was what let the one call site diverge silently. |
| 2 | **major** | ABSENT_VALUE_PHYSICS is documented as inert but perturbs every other node, and the golden row added for it deliberately omits the velocities that would show it | `edd7eff` | Comment corrected to state that the fallback is not inert; the probe now records every node's velocity so the perturbation is goldened. Policy change deferred to Unit 4 (D31). |
| 6 | **major** | The component-side ontology seam is unreachable and entirely unchecked — every gate stays green with a deliberately broken context ontology | `edd7eff` | `static.ontologyProbes.injection` drives computeVisibleGraph with a genuinely different taxonomy; verified it goes red when the predicate is reverted. |
| 7 | **major** | Simulation never receives the context ontology, so the unit leaves two ontology sources in one render tree | `edd7eff` | `useSimulation` supplies the context ontology, and `Simulation`'s parameter is now REQUIRED — the default was what let the one call site diverge silently. |
| 12 | **major** | ABSENT_VALUE_PHYSICS.charge = 0 does not mean "no repulsion" — an unknown-key node perturbs the whole layout, and the new golden freezes that in while both docstrings assert the opposite | `edd7eff` | Comment corrected to state that the fallback is not inert; the probe now records every node's velocity so the perturbation is goldened. Policy change deferred to Unit 4 (D31). |
| 13 | **major** | The fallback half of the B3/T4 fix has no check — every gate stays green with FALLBACK_NODE_STYLE resolution corrupted | `edd7eff` | `static.ontologyProbes.fallbackStyle` records the resolved fallback field by field, plus stability and non-interference with declared keys. |
| 14 | **major** | The injected taxonomy has two independent, unreachable suppliers; a Provider added later will silently desynchronize the canvas's edge-category overlay from the actual springs | `edd7eff` | `useSimulation` supplies the context ontology, and `Simulation`'s parameter is now REQUIRED — the default was what let the one call site diverge silently. |
| 17 | **major** | ABSENT_VALUE_PHYSICS is not inert — one absent-value node moves the bands and rings of every KNOWN node | `edd7eff` | Comment corrected to state that the fallback is not inert; the probe now records every node's velocity so the perturbation is goldened. Policy change deferred to Unit 4 (D31). |
| 22 | **major** | The ontology never reaches Simulation: useSimulation constructs it without the context container, so physics and render would split-brain | `edd7eff` | `useSimulation` supplies the context ontology, and `Simulation`'s parameter is now REQUIRED — the default was what let the one call site diverge silently. |
| 23 | **major** | ABSENT_VALUE_PHYSICS documents itself as inert but pushes at 55% strength, and the unit's new golden locks the contradiction in as correct | `edd7eff` | Comment corrected to state that the fallback is not inert; the probe now records every node's velocity so the perturbation is goldened. Policy change deferred to Unit 4 (D31). |
| 24 | **major** | Ontology declares nodeTypeKeys and edgeTypes that no consumer reads, while the loops that need them still iterate module singletons | `edd7eff` | The gravity overlay iterates `d.ontology.nodeTypeKeys`. `edgeTypes` remains unread — noted below rather than papered over. |
| 3 | **minor** | The link-force probe resolves edge types through the raw `edgeTypeFor` import instead of the ontology it now takes | `edd7eff` | The link probe resolves through `DEFAULT_ONTOLOGY.resolveEdgeType`, matching production. |
| 4 | **minor** | PROGRESS.md and the §6.4 blast-radius register still say Unit 1 has not started | `PLACEHOLDER_SHA` | This commit: PROGRESS Status/Counters/Gate-state/Completed-units/Defects, and PLAN §6.4 B3/B4/B5/B33. |
| 8 | **minor** | Ontology.nodeTypeKeys and Ontology.edgeTypes are declared and never read; the gravity overlay still iterates the module singleton it was supposed to stop importing | `edd7eff` | The gravity overlay iterates `d.ontology.nodeTypeKeys`. `edgeTypes` remains unread — noted below rather than papered over. |
| 9 | **minor** | ABSENT_VALUE_PHYSICS's stated intent is contradicted by the golden the same commit shipped | `edd7eff` | Comment corrected (see the absent-value cluster). |
| 10 | **minor** | visibleGraph.ts's new header asserts a property the code does not have | `edd7eff` | `visibleGraph`'s header now names what is NOT injected — the operation-splice branch and the per-child counting — instead of implying everything is. |
| 11 | **minor** | Unit-1 bookkeeping is not landed: PROGRESS still says the unit has not started and Counter B is 0 | `PLACEHOLDER_SHA` | This commit: PROGRESS Status/Counters/Gate-state/Completed-units/Defects, and PLAN §6.4 B3/B4/B5/B33. |
| 15 | **minor** | Unit 1's bookkeeping was never written: PROGRESS.md still says "Unit 1 ... (not started)" and PLAN §6.4 statuses for B3/B4/B5/B33 are blank | `PLACEHOLDER_SHA` | This commit: PROGRESS Status/Counters/Gate-state/Completed-units/Defects, and PLAN §6.4 B3/B4/B5/B33. |
| 18 | **minor** | The absentValue regression check records only the unknown node's own velocity, so the guard's stated property has no check | `edd7eff` | The absentValue runs emit `velocities(nodes)`, replacing the narrower `unknownVelocity` (D32). |
| 19 | **minor** | Four fields of FALLBACK_NODE_STYLE are unreachable, and defaultVisible:false misdescribes what actually happens to an absent-key node | `PLACEHOLDER_SHA` | Partially. The fallback's real `defType` is now goldened, so its effective visibility is visible rather than assumed. Trimming the unreachable fields waits for Unit 2/B18, which routes the def-type bridge through the container. |
| 20 | **minor** | warnOnce's Set is process-global and never cleared, so a second ontology missing the same key is silent | `edd7eff` | The warn set moved inside `createOntology`, so it is per-ontology. |
| 25 | **minor** | The force probe pins the pre-seam function, not the seam: applyLinkForce is handed edgeTypeFor instead of DEFAULT_ONTOLOGY.resolveEdgeType | `edd7eff` | The link probe resolves through `DEFAULT_ONTOLOGY.resolveEdgeType`, matching production. |
| 26 | **minor** | Blast-radius register left unmarked and B33 neither migrated nor deferred | `PLACEHOLDER_SHA` | This commit: PROGRESS Status/Counters/Gate-state/Completed-units/Defects, and PLAN §6.4 B3/B4/B5/B33. |

## What the reviewers actually caught

Three defects and one piece of dishonesty, all mine.

**The seam had two unwired ends.** Components resolved the taxonomy through
React context; `Simulation` took an ontology parameter that *defaulted*, and
the one production construction site never passed one. A reviewer proved it by
sabotaging the context default and watching all six gates stay green. That is
the shape of every dangerous finding in this run so far: two halves that are
each individually correct.

**`computeVisibleGraph` accepted an ontology and ignored it** where it counted —
the visibility predicate still went through the module singleton, so a supplied
taxonomy emptied the graph. D18 deferred that parameter from Unit 0 on the
grounds that no ontology existed yet; wiring it in Unit 1 and then not using it
was worse than either.

**The fourth widened seam got no guard.** Three accessors were defaulted in 1c;
`edgeCategory` was not, and a supplied taxonomy resolves edges to ids absent
from `params.link`, writing NaN into both endpoints on the first tick.

**And I claimed a property the code does not have.** `ABSENT_VALUE_PHYSICS` was
documented as inert. It is not: charge couples a pair by the *average* of the
two charges, so a zero repels at half strength, and a point band still moves the
median the stack re-centres on. Measured at 9 of 9 probe nodes perturbed. The
probe I shipped in the same commit recorded only the unknown node's own
velocity — so it was structurally incapable of catching it. That is the same
failure as Unit 0's blocker in miniature: a check written by the person who
wrote the thing it checks, shaped by the same assumption.

## Findings recorded, not fully actioned

- **19.** `FALLBACK_NODE_STYLE` carries fields no consumer reads, and its
  `defaultVisible: false` does not describe what happens to an absent-key node
  (the def-type bridge decides that, not this flag). The real `defType` is now
  goldened so the behaviour is visible; trimming the fields waits for Unit 2,
  which owns the bridge (B18).
- **24, in part.** `Ontology.edgeTypes` is still read by nobody —
  `SpringControls` iterates `ALL_EDGE_TYPES` directly. That conversion belongs
  with Unit 4, which rebuilds the spring control surface (B28).
