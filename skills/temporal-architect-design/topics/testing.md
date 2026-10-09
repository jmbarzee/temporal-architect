# Testing Temporal Workflows

> **Example:** [`testing.twf`](./testing.twf)

Tests are authored code, not `.twf`; the author skills write them (Go: [three-layer-testing.md](../../temporal-architect-author-go/reference/three-layer-testing.md)). This topic maps the layers and the constructs in a `.twf` to the tests they call for.

## Layers

| Layer | Mocks | Verifies | Volume |
|-------|-------|----------|--------|
| Activity unit | external clients/SDKs | valid inputs give correct output; invalid inputs give appropriate errors; external failures handled; retryable vs non-retryable errors classified; client called with expected arguments | many, fast |
| Workflow unit | activities (and child workflows) | orchestration — call order, branches, failure handling, handlers, timers | many, fast |
| Replay | nothing — recorded history | determinism across code changes | per recorded history |
| Integration / end-to-end | nothing — real Temporal server (`temporal server start-dev` or a test container) and real worker | happy path end to end, cross-service communication, failure recovery | few, slow |

Mock only a layer's direct dependency, never workflow internals (brittle). Keep deterministic logic out of integration tests — they are slow and flaky — and don't test Temporal's own internals.

## What each construct obliges

| `.twf` construct | Workflow test |
|------------------|---------------|
| Activity sequence | Assert the activities called, their arguments, and order |
| `if` / `close fail` branch | One test per branch; mock the deciding activity's return and assert later activities were *not* called on the early-exit path |
| Activity failure | Mock the failure; assert the workflow handles it as designed |
| `signal` / `await one` case | Start the workflow, send the signal from the test environment, assert the result; test signal ordering where the design depends on it |
| `timer` | Skip time with the test environment's time-skipping — never real waits; assert what has and has not run at each step |
| `query` | Block an activity mid-run, query, unblock, query again after completion |
| Child `workflow` call | Mock the child to test the parent in isolation, then run both with only activities mocked |

## Replay testing

Replay runs the current code against a history recorded from an earlier version; it passes only if the code is still deterministic for that history. It is the test that catches an unguarded change before production does (see [versioning.md](./versioning.md)).

- Record histories from test runs and keep them in version control.
- Re-record when the workflow's signature changes.
- Keep histories from several versions while a migration is in flight, so every live patch path is replayed.
