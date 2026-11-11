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

/// A branch result a task-group child sets; like `Flag`, it needs no lock.
final class Slot<Value: Sendable>: @unchecked Sendable {
    var value: Value?
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
        // await all: the first branch failure leaves the group, and .abandon leaves the other running.
        let count = Slot<Int>()
        let audited = Slot<Bool>()
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                count.value = try await context.executeActivity(
                    BatchActivities.Activities.Count.self,
                    options: .init(startToCloseTimeout: .seconds(60), cancellationType: .abandon),
                    input: input
                )
            }
            group.addTask {
                audited.value = try await context.executeChildWorkflow(
                    Audit.self, options: .init(cancellationType: .abandon), input: input)
            }
            for try await _ in group {}
        }

        // detach: abandon the child, never request its cancellation, and wait only for its start.
        _ = try await context.startChildWorkflow(
            Archive.self,
            options: .init(parentClosePolicy: .abandon, cancellationType: .abandon),
            input: input
        )

        // await one: one condition over every case, then the first listed that is ready wins.
        try await withThrowingTaskGroup(of: Void.self) { group in
            let timer = Flag()
            group.addTask {
                try await context.sleep(for: .seconds(3600))
                timer.isSet = true
            }
            try await context.condition { $0.acks > 0 || timer.isSet }
            if acks > 0 {  // listed first, so it wins a tie
                acks -= 1
            }
            group.cancelAll()  // a losing inline timer is cancelled
        }

        return Report(count: count.value!, audited: audited.value!, status: status)
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
