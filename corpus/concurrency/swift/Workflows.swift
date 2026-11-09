import Temporal

struct Report: Codable, Sendable, Equatable {
    var count: Int
    var audited: Bool
    var status: String
}

/// A flag a child task sets and a condition reads. Workflow code runs on the SDK's
/// one serial executor (`WorkflowTaskExecutor`), so the flag needs no lock.
final class Flag: @unchecked Sendable {
    var isSet = false
}

@Workflow
struct Batch {
    var status = "unacknowledged"
    // Pending arrivals of Ack. (A trailing comment here breaks the SDK macro expansion.)
    var acks = 0

    @WorkflowSignal
    mutating func ack(input: Void) {
        status = "acknowledged"
        acks += 1
    }

    mutating func run(context: WorkflowContext<Self>, input: [String]) async throws -> Report {
        // await all
        async let counted = context.executeActivity(
            BatchActivities.Activities.Count.self,
            options: .init(startToCloseTimeout: .seconds(60)),
            input: input
        )
        async let audited = context.executeChildWorkflow(Audit.self, input: input)
        let (count, wasAudited) = try await (counted, audited)

        // detach: abandon the child, never request its cancellation, and wait only for its start.
        _ = try await context.startChildWorkflow(
            Archive.self,
            options: .init(parentClosePolicy: .abandon, cancellationType: .abandon),
            input: input
        )

        // await one: one condition over every case, then the first listed that is ready wins,
        // so Ack wins a tie with the timer; the losing inline timer is cancelled.
        try await withThrowingTaskGroup(of: Void.self) { group in
            let timer = Flag()
            group.addTask {
                try await context.sleep(for: .seconds(3600))
                timer.isSet = true
            }
            try await context.condition { $0.acks > 0 || timer.isSet }
            if acks > 0 {
                acks -= 1
                group.cancelAll()
            }
        }

        return Report(count: count, audited: wasAudited, status: status)
    }
}

@Workflow
struct Audit {
    mutating func run(context: WorkflowContext<Self>, input: [String]) async throws -> Bool {
        !input.isEmpty
    }
}

@Workflow
struct Archive {
    mutating func run(context: WorkflowContext<Self>, input: [String]) async throws {
        try await context.executeActivity(
            BatchActivities.Activities.Store.self,
            options: .init(startToCloseTimeout: .seconds(60)),
            input: input
        )
    }
}
