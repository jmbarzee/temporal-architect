import Temporal

@ActivityContainer
struct JobActivities {
    /// Process waits for this before it returns; nil returns at once. Set only by tests.
    let hold: (@Sendable () async -> Void)?

    init(hold: (@Sendable () async -> Void)? = nil) {
        self.hold = hold
    }

    static let rejectDefaults = ActivityOptions(
        startToCloseTimeout: .seconds(60),
        retryPolicy: RetryPolicy(maximumAttempts: 1)
    )

    @Activity
    func reject(input: String) throws {
        throw ApplicationError(message: "rejected \(input)", type: "Rejected")
    }

    @Activity
    func process(input: String) async {
        await hold?()
    }
}

@Workflow
struct Job {
    let item: String
    var proceeding = false

    init(input: String) {
        item = input
    }

    @WorkflowSignal
    mutating func proceed(input: Void) {
        proceeding = true
    }

    // Reject's failure fails only the update; the run goes on.
    @WorkflowUpdate
    mutating func attempt(context: WorkflowContext<Self>, input: Void) async throws {
        try await rejectAndProcess(context)
    }

    mutating func run(context: WorkflowContext<Self>, input: String) async throws {
        try await context.condition { $0.proceeding }
        // Reject's failure fails the run.
        try await rejectAndProcess(context)
    }

    // await all: the first branch failure leaves the group at once, with that failure. The group
    // then cancels Process's task, which with .abandon sends no cancel request: Process keeps running.
    func rejectAndProcess(_ context: WorkflowContext<Self>) async throws {
        let item = item
        var rejectOptions = JobActivities.rejectDefaults
        rejectOptions.cancellationType = .abandon
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { [rejectOptions] in
                try await context.executeActivity(
                    JobActivities.Activities.Reject.self, options: rejectOptions, input: item)
            }
            group.addTask {
                try await context.executeActivity(
                    JobActivities.Activities.Process.self,
                    options: .init(startToCloseTimeout: .seconds(60), cancellationType: .abandon),
                    input: item
                )
            }
            for try await _ in group {}
        }
    }
}
