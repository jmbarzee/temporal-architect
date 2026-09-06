# Review — Unit 3 (N-dimensional filters + chain UI)

**§3.2 review record. PR scope.** First run under the §3.5.6 cost rules: root-cause
clustering, verification only for what is in doubt, baseline handed over rather
than re-derived, cheap tier for clustering.

**42 findings, 41 reproduced** (3 blocker, 9 major, 30 minor), across **65
break-and-observe experiments**, for **1.86M subagent tokens** and 15 agents.

All 3 blockers and all 9 majors are resolved with the sha that resolved them.

## The rules worked, measurably

| | Unit 2 | Unit 3 |
|---|---:|---:|
| agents | 20 | **15** |
| tokens | 2.00M | **1.86M** |
| findings → clusters | 31 → 29 | 42 → **20** |
| clusters verified | 14 of 14 | **8 of 20** |
| refuted | **0** | **1** |

Clustering on mechanism instead of file path is what did it: Unit 2 paid to
verify one root cause seven times. And the verify stage refuted something for the
first time — a claim that PROGRESS.md *and* D43 were both stale, where only D43
was. A stage that never refutes is not adversarial; this one now is.

Rule 8 is the one I got wrong: I wrote "isolation applies to every stage that
mutates" into §3.5.6 and then **did not set it on the verifiers**, exactly as in
Unit 2. A verifier reported working in the live worktree and seeing my dev server
and in-flight edits. No damage — the tree was clean afterwards and every gate
green — but the rule failed on the run that introduced it. Recorded as F17.

## Blockers

| # | finding | resolved by | how |
|---|---|---|---|
| 1 | Every per-kind chip tint is dead: 3d emits `header-type-tag-<id>`, the stylesheet keys on `header-type-<id>` | `d70cd53` | A `modifierPrefix` per axis, because deriving the modifier from `chipClass` was the bug. File chips also regained their full-path tooltip — the label is only the basename, so same-named files in different directories had become identical chips. |
| 2 | Removing an axis does not durably unfilter: the reconciler re-imports it on the next view switch | `d70cd53` | `reconcileFilter` takes the **destination's chain**, not every declared axis. The focused-file effect had the same hole. Reproduced live by the reviewer: the graph dropped to 8 nodes with no Kind chip anywhere — the exact invisible state D44 removes an axis to prevent. |
| 3 | A third host-declared axis is silently unrenderable while it still filters | `d70cd53` | Unknown axes render with neutral styling plus an explicit empty state, and hosts can supply values via `valuesByDimension`. Vanishing is what made an unrecognised axis dangerous rather than merely unsupported. |

Blocker 2 is the sharpest of the three, because it is a defect **in the fix from
earlier in the same unit**. D44 reasoned correctly about one interaction and
missed the other.

## Majors

| # | finding | resolved by | how |
|---|---|---|---|
| 4 | `DimensionDescriptor.reheat` is declared policy no gate reads — `resume: false`, the exact failure T9 names, passes everything | `d70cd53` | The fold became a pure `foldReheatPolicy`, and `ontologyProbes.reheatPolicy` goldens each axis's policy plus the fold for **every subset** of axes. Verified: the sabotage now turns the golden red. The reviewer's control is what made this airtight — flipping the sibling `focus` field *does* go red, so the suite was blind to this field specifically, not to descriptors generally. |
| 5 | The chip-flash animation is dead in both views: producers emit `file:`/`type:`, the consumer reads `sourceFile:`/`defType:` | `d70cd53` | Producers loop the filter's own axes, so the two cannot drift again. |
| 6 | `Ontology.abbreviationFor` is a fourth unguarded prototype lookup — returns a `Function` for `constructor` | `d70cd53` | Guarded with `hasOwn`. D39 fixed three and missed this one. |
| 7 | The prototype probe drops its own worst row: `__proto__` is lost to the setter *and* to the snapshot canonicaliser | `d70cd53` | Rows are a list, which has no key space to collide with. A blind spot inside the instrument built for blind spots — the third this unit. |
| 8 | Pinning the Kind axis silently resets the File selection | `d70cd53` | The focused-file effect depended on the whole `PinState`; when pins became Maps, pinning *any* axis produced a new Map and re-ran it. Narrowed to the one boolean. |
| 9 | TreeView keeps a second hardcoded implementation of both axes' policy | `b4ef9f3` | Split into `passesSelection` (policy, once, from descriptors) plus a per-caller value accessor. The projection stays local on purpose: a graph node has a dimension map, a tree row has named fields. |

## What I reverted

I guarded the initial fit against an empty node set, could not demonstrate it
changed anything, and took it back out. The blank canvas that prompted it
**reproduces identically at Unit 2's HEAD**, so it is not this unit's, and
measuring the canvas showed it is not blank at all: 9,902 pixels are drawn at
`y=0`, behind the filter bar, which overlays the canvas and wraps to three rows
at narrow widths. Recorded for Unit 6/7, which own the bar. Shipping an
unverified fix is the habit this run keeps punishing.

## Carried, not fixed

- `ontology.valueOn` special-cases the `defType` axis inside the library. Argued
  as library-declared shared vocabulary; the reviewer argues it is the domain
  leaking back under a neutral name. **Unit 4 should settle it**, since Unit 4
  makes the axis a user choice.
- The `PRESENTATION` table still names both axes for classes and value sourcing.
  Unit 6 owns the class names (B30), Unit 7 the value sourcing.
- `dimensionsOf`, `descriptor.labelFor`/`abbreviationFor` and the `DimensionalMapping`
  surface have no production reader yet — Unit 4 consumes the mapping.
- A pin can outlive its axis: persisted, unreachable, still governing
  reconciliation. Small, and cleanest to fix when Unit 7 reworks control scope.
- The T5 identity probe never puts a *pinned* axis through a reconcile, so D43's
  regression is re-introducible in that one path.

## On the review itself

Six lenses, five of six matching the supplied baseline (one arrived on the wrong
commit and said so — that is the honest failure mode, and it reported the
mismatch rather than reviewing anyway).

The single most valuable thing across both reviews remains the schema field that
forces a finder to state **what it broke and what the gate said**. Every blocker
here came with a reproduction; the one refuted claim was the one asserted from
reading.
