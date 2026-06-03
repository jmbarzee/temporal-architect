# Design Checklist

**Validation ≠ review.** *Validation* asks "does it parse and resolve?" (`twf check`). *Review* asks "is it a good Temporal design?" — and no tool answers that. A clean `twf check` clears only the first group below; the [Design Review](#design-review) group is where design quality lives. Don't present on a green tool alone.

## TWF Validation
- [ ] `twf check` passes (`✓ OK`)
- [ ] `twf symbols` lists all expected definitions
- [ ] No undefined references
- [ ] No SDK-specific code in `.twf`
→ See [common-errors.md](./common-errors.md) for error troubleshooting

## Design Review (fresh-eyes pass — no tool catches these)
- [ ] **Call-site integrity** — every activity/workflow/nexus definition has a *structured* call site (no orphaned `x = Name(args)` parsing as `raw`)
- [ ] **Reachability** — every workflow is reachable from a declared entry point; no dead workflows
- [ ] Design re-checked against **every** anti-pattern in [anti-patterns.md](./anti-patterns.md)
- [ ] Each non-idempotent activity names its idempotency strategy + key derivation
- [ ] Concurrent fan-out branches that write shared external state state their isolation/keying assumption
→ See [SKILL.md § Design Review](../SKILL.md#design-review)

## Determinism
- [ ] All I/O, time, randomness in activities
- [ ] No external calls in workflow code
- [ ] Loops have deterministic bounds
- [ ] Timers use Temporal primitives
- [ ] No non-deterministic data structure iteration (maps, sets)
- [ ] Version-specific branching uses proper versioning pattern
→ See [core-principles.md](./core-principles.md) for determinism rules

## Idempotency
- [ ] Activities handle "already exists" gracefully
- [ ] Retries produce same end state
- [ ] No duplicate side effects on replay
→ See [core-principles.md](./core-principles.md) for idempotency patterns

## Failure Handling
- [ ] Each failure mode identified
- [ ] Recovery strategy defined (retry, compensate, fail)
- [ ] Partial success handled
- [ ] Timeouts configured
→ See [anti-patterns.md](./anti-patterns.md) for common failure handling mistakes

## Runtime, Cost & Lifecycle
- [ ] Loops with large accumulated history reach `close continue_as_new` (bound alone is not enough); strategy stated
- [ ] Large payloads: either deferred to the data converter/codec, or (if an explicit claim-check `*Ref`) a one-line store + lifecycle note
→ See [anti-patterns.md](./anti-patterns.md#large-payloads-in-workflow-state) and [long-running.md](../topics/long-running.md)

## Decomposition
- [ ] Each workflow has single clear purpose
- [ ] Child workflow vs activity choice justified
- [ ] Workflow names describe outcomes, not steps
→ See [workflow-boundaries.md](./workflow-boundaries.md) for boundary decisions

## Deployment Topology (design review — `twf check` validates syntax)
- [ ] Worker groupings reflect actual deployment needs (not just "one worker for everything")
- [ ] Task queue separation matches scaling and isolation requirements
- [ ] Namespace count justified by org / security / lifecycle / external-contract boundaries (default: one)
- [ ] Cross-namespace calls have nexus endpoints
- [ ] `twf check` passes topology validation
→ See [task-queues.md](../topics/task-queues.md) for task queue design and [namespaces.md](./namespaces.md) for namespace count
