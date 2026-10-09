# Workflow vs Activity Boundary

## Use Activities When

**Default: one activity per network call / external interaction**, so Temporal's retry, timeout, and backoff land on exactly the unit that fails independently. Deviate only as an optimization ([core-principles.md](./core-principles.md#activities-are-for-io--not-in-memory-work)).

- Single atomic operation against an external system (API, DB, file)
- Short, predictable completion time (one timeout period)
- No orchestration logic

## Use Child Workflows When

Multiple steps with their own retry/timeout policy, failure boundary, or history, or reuse across parents — criteria in [child-workflows.md](../topics/child-workflows.md#when-to-use-child-workflows). A child's separate history matters because each history is capped ([long-running.md](../topics/long-running.md)). Don't use a child just for code organization. When in doubt between a child workflow and an activity, use an activity.

**Rules of thumb:** [orchestration in activities](./anti-patterns.md#orchestration-in-activities) means a workflow; [monolith](./anti-patterns.md#monolithic-workflow) or [wrapper](./anti-patterns.md#wrapper-workflow) means re-cut.

## Use Nexus When

- Crosses namespace or team boundaries (separate deployment lifecycle)
- Different team owns the target service
- Target needs independent scaling, versioning, or failure isolation at the organizational level
- You want a typed API contract between services

**Child workflow vs Nexus:** a child shares the namespace and the parent's lifecycle; any condition above means Nexus. Topology and routing: [task-queues.md](../topics/task-queues.md).
