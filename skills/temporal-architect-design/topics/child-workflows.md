# Child Workflows

> **Example:** [`child-workflows.twf`](./child-workflows.twf)

## When to Use Child Workflows

| Use Child Workflow | Use Activity Instead |
|--------------------|---------------------|
| Multi-step operation with own retry logic | Single atomic operation |
| Reusable across multiple parent workflows | One-off operation |
| Need independent timeout/retry policies | Same policies as parent |
| Operation is complex enough to warrant own tests | Simple request-response |
| Very long operation (separate history) | Completes quickly |
| Different failure semantics needed | Parent handles all failures |

**Rule of thumb:** If the operation has its own "shape" that you'd want to test independently, it's a child workflow. A child that wraps a single activity is the [wrapper-workflow anti-pattern](../reference/anti-patterns.md#wrapper-workflow).

## Execution Modes

| Mode | Syntax | Behavior |
|------|--------|----------|
| **Synchronous** | `workflow Name(args) -> result` | Parent blocks until the child completes; result bound |
| **Async** | `promise p <- workflow Name(args)` … `await p -> result` | Parent continues; awaits the promise later |
| **Detached** | `detach workflow Name(args)` | Started; the child outlives the parent, its result never observed (Detach in `twf spec statement-syntax`) |

`promise` and `detach` work the same on nexus calls — see [nexus.md](./nexus.md#execution-modes). Per-call config (`workflow_execution_timeout`, `retry_policy`, `parent_close_policy`, …) goes in an `options:` block under the call.

## Lifecycle and Failure

What happens to a running child when the parent closes is set by `parent_close_policy`:

| Policy | Behavior |
|--------|----------|
| `TERMINATE` | Child **terminated** (not merely cancelled) when the parent closes — completes, fails, or is cancelled. Default |
| `REQUEST_CANCEL` | Cancellation requested; child can handle it gracefully |
| `ABANDON` | Child continues independently |

A child that loses an `await one` race keeps running; its `parent_close_policy` decides its fate when the parent closes.

A child that fails (after its retries) fails the parent; shape that with the child's `retry_policy` and timeouts. Error handling beyond that is SDK-level. Children joined in `await all` fail it on the first failure, so a partial failure reaches the parent only as a returned value ([patterns.md](./patterns.md#fan-outfan-in)).

## Workflow ID Design

A start never writes an ID. When a child's ID must be reconstructed later, declare it on the child type's `id_scheme:` ([workflow-id-schemes.md](./workflow-id-schemes.md)); otherwise the SDK generates one. `workflow_id_reuse_policy` is set in the child type's `default_options:` or overridden at the start:

| Policy | Behavior when a *closed* execution has the ID |
|--------|-----------------------------------------------|
| `ALLOW_DUPLICATE` | Start a new execution |
| `ALLOW_DUPLICATE_FAILED_ONLY` | Start a new execution only if the previous one did not complete successfully |
| `REJECT_DUPLICATE` | Error |

A schemed start is idempotent: starting a child whose ID is still running fails (`ChildWorkflowExecutionAlreadyStartedError` in Go); for a closed one, the reuse policy decides. A child start cannot join or replace a running execution: it takes no `workflow_id_conflict_policy`, and the type's default one does not apply to it (`CHILD_START_CONFLICT_MISMATCH`) — see [start collisions](./workflow-id-schemes.md#start-collisions).

## Decomposition and Testing

Children decompose sequentially (`DeployApplication`), in parallel under `await all:` (`ParallelItemBatch`), or conditionally (`Onboarding`), and nest to any depth — a shard deploys orgs, each org deploys peers, each peer runs activities. Test the parent with mocked children and the tree together in integration; see [testing.md](./testing.md#what-each-construct-obliges).
