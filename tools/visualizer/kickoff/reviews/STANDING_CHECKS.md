# Standing checks — question-shapes that have found real bugs on this run

**Hand this to every review finder.** It exists to convert expensive rediscovery
into cheap recall: several Unit 2 findings had been latent since Unit 1, and one
shape has produced the worst finding in three consecutive units. A finder that
clears this list quickly has its whole budget left for new ground.

Every entry below is earned — it names the unit that paid for it.

### 1. Two halves, each individually correct  *(F12 — Units 0, 1 and 2)*

The highest-yield question on this run, by a distance. Not "is this wrong", but
**"are there two mechanisms here that would each pass review alone?"**

- Unit 0: the harness goldened everything *except* what depended on the layout.
- Unit 1: the renderer resolved the taxonomy through a container, the engine
  through a module singleton.
- Unit 2: the style axis lived in a data field *and* in a closure.

No gate can see these, because each half is correct. Look for one fact reachable
by two paths and ask what happens when they disagree.

### 2. A fact stored twice with nothing enforcing agreement  *(Unit 2, PLAN §6.6)*

The generalisation of #1. `chargeDimension` names an axis; `keys(charge)` implies
one. `DimensionDescriptor` declares empty/absent semantics; the visibility
predicate hard-codes them. Ask: **can I name a state the types permit that the
domain has no meaning for?**

### 3. Does a miss return a *real* value?  *(Units 1 and 2)*

A lookup that misses should be distinguishable from one that hits. Three
instances, all silent:

- `?? 'workflow'` — an unknown input resolved to a *real* type (T19).
- `table[key]` where `key` is host-supplied — `constructor` resolves up the
  prototype chain, so `?? default` never fires (D39).
- `ABSENT_VALUE_PHYSICS` — "absent" encoded as charge 0, which still *couples*
  because charge averages across a pair.

### 4. Who reads this, other than the harness?  *(F15 — Unit 2)*

A golden row makes dead code look load-bearing. `nodeDefType.ts` survived three
commits with every gate green because `static-golden.ts` still imported it. Gate 4
counts vocabulary, Gate 6 counts import *direction*; **nothing counts readers.**
`kickoff/MAP.md`'s "Files nothing imports" section answers this in one read now.

### 5. Does the exit code mean the output is usable?  *(Unit 2 blocker)*

`build:lib` exited 0 while emitting a `lib.d.ts` that re-exported a module it had
not written. An exit code is a claim about the *process*. Ask separately whether
anything checks the *artifact*.

### 6. Does this aggregate cover what it claims?  *(Unit 2)*

`make check-visualizer` was called "all gates" for the whole run while omitting
Gate 2. Nothing was checking the aggregate against `VERIFICATION.md`'s list.

### 7. Does a gate rule name one type, one path, one file?  *(Unit 2)*

`as-nodetype` matched a single type name and became permanently vacuous the
moment that type was renamed — measuring 0 while the identical cheat was
re-introducible as `as DimensionValue`. A rule keyed to a name dies when the name
does.

### 8. Does moving code change what measures it?  *(D40 — Unit 2)*

Relocation improved all three ratchets while deleting nothing, because
`src/adapter/` was outside every one of them. Ask what a *move* does to each
counter, not just what an edit does.

### 9. Is the declared invariant checked anywhere?  *(run-wide)*

On this run, an invariant without a check is a wish. If a comment or a doc
asserts a property, find the thing that would go red if it stopped holding — and
if there isn't one, that is the finding.

### 10. Is this a regression, or persisted state?  *(Gate 5, Unit 2)*

A stale `localStorage` filter made the default visible set read as a regression
(13 nodes where the record said 37). Clear the state before believing a
behaviour change — and say which state you measured in.
