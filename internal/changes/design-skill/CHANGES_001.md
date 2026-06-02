# Design Skill Changes

**Source review(s):** propagated from `internal/changes/dsl/CHANGES_003.md` (cross-workflow signal send)
**REVISIONS file(s):** none (ad-hoc propagation alongside the parser landing of the same feature)

## Summary

Documented the send side of signals in the design skill. The signals topic previously covered only the receive side (declaring handlers, awaiting arrivals); it now teaches the handle-bound, statement-only cross-workflow signal send (`signal handle.Name(args)`).

## Changes by Type

### Documentation

- **`skills/design/topics/signals-queries-updates.md`**: added a "Sending Signals to a Child Workflow" section after the Signals (receive-side) section. Covers the handle-bound statement form with the `OrderSaga` worked example, fire-and-forget semantics stated explicitly (no `await`/`promise`/`await one` form — a signal carries no return value, and send-acceptance is not handler execution), the two resolution rules (handle must be workflow-bound; target must declare the signal), and the dual role of a workflow-bound promise (awaitable + signal target). Stays silent on absent capabilities (external/ID addressing, cross-workflow query/update), consistent with how the skill treats unimplemented features. No await/promise send forms are described — they do not exist.

## Notes

- The companion `signals-queries-updates.twf` example was intentionally **not** extended in this pass; the inline `OrderSaga` example in the markdown matches the parser-verified construct. Extending the runnable example with a parent/child send pair is a candidate for a future `review-quality-skill` pass.
