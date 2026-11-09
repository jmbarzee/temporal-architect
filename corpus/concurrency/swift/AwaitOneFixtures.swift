import Temporal

// Test workflows for await one; registered only by BatchTests.

struct Tie: Codable, Sendable {
    /// The cases in listed order: "Ack" and "timer".
    var order: [String]
    /// "await one" (the mapped shape), "race" (task group, first finished) or "timeout" (`context.timeout` over a condition).
    var form: String
}

/// Batch's await one over Ack and timer(1h), the cases listed in order; returns the winner.
@Workflow
struct AwaitOneTie {
    var acks = 0

    @WorkflowSignal
    mutating func ack(input: Void) { acks += 1 }

    mutating func run(context: WorkflowContext<Self>, input: Tie) async throws -> String {
        switch input.form {
        case "race":
            return try await withThrowingTaskGroup(of: String.self) { group in
                for c in input.order {
                    if c == "Ack" {
                        group.addTask {
                            try await context.condition { $0.acks > 0 }
                            return "Ack"
                        }
                    } else {
                        group.addTask {
                            try await context.sleep(for: .seconds(3600))
                            return "timer"
                        }
                    }
                }
                let first = try await group.next()!
                group.cancelAll()
                return first
            }
        case "timeout":
            do {
                try await context.timeout(for: .seconds(3600)) {
                    try await context.condition { $0.acks > 0 }
                }
                return "Ack"
            } catch {
                return "timer"
            }
        default:
            return try await withThrowingTaskGroup(of: Void.self) { group in
                let timer = Flag()
                group.addTask {
                    try await context.sleep(for: .seconds(3600))
                    timer.isSet = true
                }
                let order = input.order
                func ready(_ c: String, _ acks: Int) -> Bool { c == "Ack" ? acks > 0 : timer.isSet }
                try await context.condition { s in order.contains { ready($0, s.acks) } }
                let winner = order.first { ready($0, acks) }!
                if winner == "Ack" {
                    acks -= 1
                    group.cancelAll()
                }
                return winner
            }
        }
    }
}

/// A promise bound once, timer(24h), raced against Ack every round; returns the Acks counted.
@Workflow
struct BoundDeadline {
    // Pending arrivals of Ack. (A trailing comment here breaks the SDK macro expansion.)
    var acks = 0

    @WorkflowSignal
    mutating func ack(input: Void) { acks += 1 }

    mutating func run(context: WorkflowContext<Self>, input: Void) async throws -> Int {
        var counted = 0
        // promise deadline <- timer(24h): bound before the rounds, so losing one never cancels it.
        let deadline = Flag()
        async let fired: Void = {
            try await context.sleep(for: .seconds(86_400))
            deadline.isSet = true
        }()
        while true {
            try await context.condition { $0.acks > 0 || deadline.isSet }
            if acks == 0 {
                try await fired
                return counted
            }
            acks -= 1
            counted += 1
        }
    }
}

let awaitOneFixtures: [any WorkflowDefinition.Type] = [AwaitOneTie.self, BoundDeadline.self]
