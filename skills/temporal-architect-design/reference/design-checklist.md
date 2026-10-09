# Design Checklist

The rubric for the [Design Review](../SKILL.md#design-review). `twf check` clears only the first group; no tool checks the rest.

## Validation
- [ ] `twf check` passes (`✓ OK`), including worker/namespace topology — see [common-errors.md](./common-errors.md)
- [ ] `twf symbols` lists every expected definition
- [ ] No SDK-specific code in `.twf`

## Wiring
- [ ] **Call-site integrity** — every `activity` / `workflow` / `nexus` definition has a *structured* call site. A bare `x = Name(args)` parses as `raw` text and is silently not wired up; these orphans hide behind a clean `twf check`.
- [ ] **Reachability** — every workflow is reachable from a declared entry point by a call or Nexus op; name leftover workflows as dead rather than assuming they're live.
- [ ] **Anti-patterns** — the finished design re-checked against **every** entry in [anti-patterns.md](./anti-patterns.md).

## Determinism — [core-principles.md](./core-principles.md)
- [ ] All I/O, time, and randomness in activities; no external calls in workflow code
- [ ] Loops have deterministic bounds; no map/set iteration
- [ ] Timers use Temporal primitives
- [ ] Version-specific branching uses the versioning pattern

## Idempotency — [core-principles.md](./core-principles.md#state-the-strategy-in-the-design)
- [ ] Each activity that isn't idempotent by nature states its strategy and key derivation (e.g. workflow ID + activity name); retries reach the same end state, "already exists" is handled
- [ ] **Concurrent writes** — parallel fan-out (`await all`, `for` + promises) whose branches write the same external record states its isolation/keying assumption; TWF can't express it, so only review catches it

## Failure Handling — [anti-patterns.md](./anti-patterns.md)
- [ ] Each failure mode has a recovery strategy (retry, compensate, fail), including partial success
- [ ] Timeouts and retries set wherever failure can happen

## Runtime, Cost & Lifecycle — [long-running.md](../topics/long-running.md)
- [ ] Loops with large accumulated history reach `close continue_as_new` (a bound alone is not enough); strategy stated
- [ ] Large payloads either deferred to the data converter/codec, or, for an explicit claim-check `*Ref`, a one-line store + lifecycle note — [anti-patterns.md](./anti-patterns.md#large-payloads-in-workflow-state)

## Decomposition — [workflow-boundaries.md](./workflow-boundaries.md)
- [ ] Each workflow has a single clear purpose, named for its outcome, not its steps
- [ ] Each child-workflow-vs-activity choice is justified

## Deployment Topology — [task-queues.md](../topics/task-queues.md), [namespaces.md](./namespaces.md)
- [ ] Worker groupings reflect real deployment needs, not "one worker for everything"
- [ ] Task queue separation matches scaling and isolation requirements
- [ ] Namespace count justified by org / security / lifecycle / external-contract boundaries (default: one)
- [ ] Cross-namespace calls go through Nexus endpoints
