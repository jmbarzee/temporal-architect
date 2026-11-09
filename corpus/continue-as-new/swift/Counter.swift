import Temporal

@ActivityContainer
struct CounterActivities {
    @Activity
    func increment(input: Int) -> Int {
        input + 1
    }
}

@Workflow
struct Counter {
    struct Input: Codable, Sendable {
        var count: Int
        var limit: Int
    }

    mutating func run(context: WorkflowContext<Self>, input: Input) async throws -> Int {
        try await context.sleep(for: .seconds(60))
        let next = try await context.executeActivity(
            CounterActivities.Activities.Increment.self,
            options: .init(startToCloseTimeout: .seconds(60)),
            input: input.count
        )
        if next >= input.limit {
            return next
        }
        // Throwing the error ends this run and starts the next with its input.
        throw try await context.makeContinueAsNewError(
            options: .init(),
            input: Input(count: next, limit: input.limit)
        )
    }
}
