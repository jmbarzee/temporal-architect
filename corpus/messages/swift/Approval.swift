import Temporal

struct Decision: Codable, Sendable, Equatable {
    var request: String
    var approver: String
    var note: String
    var status: String
}

@Workflow
struct Approval {
    @WorkflowQuery
    var status: String = "submitted"

    var opens = Arrivals<Void>()
    var approves = Arrivals<String>()
    var reviews = Arrivals<String>()

    @WorkflowSignal
    mutating func open(input: Void) {
        status = "open"
        opens.add(())
    }

    @WorkflowSignal
    mutating func approve(input: String) {
        status = "approved"
        approves.add(input)
    }

    @WorkflowUpdate
    mutating func review(input: String) -> String {
        status = "reviewed"
        reviews.add(input)
        return status
    }

    mutating func run(context: WorkflowContext<Self>, input: String) async throws -> Decision {
        try await context.take(\.opens)
        // promise approval <- signal Approve: the ticket is taken here, at the binding,
        // and the async let child claims at it, so a later waiter of Approve queues behind it.
        let ticket = approves.begin()
        async let approval = context.take(\.approves, at: ticket)
        let note = try await context.take(\.reviews)
        let approver = try await approval
        return Decision(request: input, approver: approver, note: note, status: status)
    }
}
