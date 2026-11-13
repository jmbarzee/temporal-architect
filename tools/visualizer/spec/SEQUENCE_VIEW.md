# Sequence View

The sequence view draws one execution: lanes side by side, time running down, messages between them. The tree and the graph show every path of a design; this shows one path, so it reads the execution contract ([#752](https://github.com/jmbarzee/temporal-architect/issues/752)) and nothing of the design. Its code is `src/sequence/`, and its input type there is provisional until #752 settles.


## Fixed rules

A rule is fixed when it holds in every diagram with no setting, per diagram or per step, so a reader who learns it once reads every diagram by it. Each rule gives its reason and the fixture (`src/sequence/fixtures/rules.ts`) that its test (`layout.test.ts`, "the fixed rules") draws. The two samples, hand drawings of [temporal-agent-sandbox](https://github.com/jmbarzee/temporal-agent-sandbox) and [temporal-spot-training](https://github.com/jmbarzee/temporal-spot-training), reproduce on their drawn rows.

### Rows (`rule-rows`)

Time runs down in rows. A step sits one row below the step before it in its lane (or the step that started the lane) and below each step it names in `after`; `pause` adds rows of quiet. Only a link end (below) moves a step further.

*Why:* a step is never above what it waited for.

### Link ends (`rule-link-ends`)

A message's send and receive sit on one row, the later of the two; ends joined through a shared step share it too. The arrow runs level between the facing edges of the two boxes. A message from outside the design enters from the left, its source named. An order that cannot be drawn so, a cycle, is refused.

*Why:* a level arrow cannot misstate order.

### Lane set and grouping (`rule-queue-tag`, `rule-queue-lane`, `rule-grouping`)

Lanes are columns in order of first appearance. Lanes sharing a `title` share a column, as hosts coming and going on one queue do, and their lifetimes may not overlap. A lane is a column only when something lives on it: a step it owns, or a start. A queue nothing else lives on is no lane; its name is a tag beside the steps offset toward it.

*Why:* a column holds a participant's own history, which borrowed work lacks.

### Workflow lifetime (`rule-lifetimes`)

A workflow is a box from its start step's row (the top when it has none) to its last step.

*Why:* its extent says when it ran.

### Host lifetime (`rule-lifetimes`)

A host is a bar from its start step to its end step, lasting to the bottom when it has none, and struck with a mark when its end step failed.

*Why:* the end of the bar says how the host ended.

### External lifetime (`rule-lifetimes`)

An external participant's line runs the full height.

*Why:* the design says nothing of when it exists.

### Spans (`rule-lifetimes`)

A span is a bar along its lane's right edge from its `from` step to its `to` step.

*Why:* a state held across steps reads as an extent beside them.

### Offset (`rule-offset`, `rule-queue-tag`)

A step owned by one lane and run on another queue is drawn in its owner's lane, shifted one fixed distance toward its executor: toward the column that carries the queue, else left. A step on its own lane's queue is not shifted. The step's `queue` is the only input; no step carries a switch.

*Why:* the shift says the step ran elsewhere while its lane still says whose it is.

### Attempts (`rule-attempts`)

The first attempt of a call is a box with its verb. Each retry is a box of its own, marked ↺ in the verb's place.

*Why:* each attempt waits and runs separately, so each takes a row.

### Winners and hidden losers (`rule-winners`)

An `await one` is drawn as the branch that won. A branch that lost is hidden by being absent, not by a flag: the view draws the steps it is given. A timer armed and then cancelled is such a step, in its lane before the winner, dashed and marked cancelled, with nothing linked to it.

*Why:* a loser that started nothing has nothing to place.

### One box per call (`rule-one-box`)

A call is one box, in the lane of whoever made it. An activity run on another queue is not repeated in its executor's column; a child start is one box in the parent with an arrow to the child's header. A signal is a box at each end, because each end is an event of its own lane.

*Why:* the diagram counts what a lane did, once.


## Derived, fitted and authored

- **Derived:** rows, column positions, and the space an offset tag or outside source needs. Columns are spaced so that what is drawn for one clears the next by a fixed gap.
- **Fitted to the two hand drawings, not derived:** the margin, the offset distance, the top of the first row, and the sizes and pitch in `layout.ts`.
- **Authored in the payload, not fixed here:** pauses, outside sources, spans, and which cancelled timers appear. [#761](https://github.com/jmbarzee/temporal-architect/issues/761) decides which stay authored.
