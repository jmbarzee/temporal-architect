import Temporal

// Test workflows for Arrivals; registered only by ArrivalsTests. Each has a signal X
// whose arrivals queue in xs.

/// A flag a child task sets and a condition reads. Workflow code runs on the SDK's
/// one serial executor (`WorkflowTaskExecutor`), so the flag needs no lock.
final class Flag: @unchecked Sendable {
    var isSet = false
}

@Workflow
struct TwoWaiters {
    var xs = Arrivals<String>()

    @WorkflowSignal
    mutating func x(input: String) { xs.add(input) }

    /// The waiter created first sleeps before it waits, so the other begins waiting first.
    mutating func run(context: WorkflowContext<Self>, input: Void) async throws -> [String: String] {
        try await withThrowingTaskGroup(of: (String, String).self) { group in
            group.addTask {
                try await context.sleep(for: .seconds(1))
                return ("created first", try await context.take(\.xs))
            }
            group.addTask { ("began first", try await context.take(\.xs)) }
            var took: [String: String] = [:]
            for try await (k, v) in group { took[k] = v }
            return took
        }
    }
}

@Workflow
struct PromiseThenAwait {
    var xs = Arrivals<String>()

    @WorkflowSignal
    mutating func x(input: String) { xs.add(input) }

    /// Binds a promise on X, then awaits X.
    mutating func run(context: WorkflowContext<Self>, input: Void) async throws -> [String: String] {
        // The ticket is taken here, synchronously; the async let child claims at it when ready.
        let ticket = xs.begin()
        async let p = context.take(\.xs, at: ticket)
        let awaited = try await context.take(\.xs)
        return ["promise": try await p, "await": awaited]
    }
}

@Workflow
struct CancelledWaiter {
    var xs = Arrivals<String>()

    @WorkflowSignal
    mutating func x(input: String) { xs.add(input) }

    /// Starts a waiter of X and cancels it, then takes X.
    mutating func run(context: WorkflowContext<Self>, input: Void) async throws -> String {
        try await withThrowingTaskGroup(of: String.self) { group in
            group.addTask { try await context.take(\.xs) }
            try await context.sleep(for: .seconds(1))
            group.cancelAll()
            return try await context.take(\.xs)
        }
    }
}

@Workflow
struct AwaitOne {
    var xs = Arrivals<String>()

    @WorkflowSignal
    mutating func x(input: String) { xs.add(input) }

    /// await one: a case for X raced against an inline timer (listed second), then takes X.
    mutating func run(context: WorkflowContext<Self>, input: Int) async throws -> [String] {
        var took: [String] = []
        let ticket = xs.begin()
        try await withThrowingTaskGroup(of: Void.self) { group in
            let timer = Flag()
            group.addTask {
                try await context.sleep(for: .seconds(input))
                timer.isSet = true
            }
            try await context.condition { $0.xs.ready(ticket) || timer.isSet }
            if xs.ready(ticket) {
                took.append("case " + xs.claim())  // first listed wins
            } else {
                xs.leave(ticket)
                took.append("timer")
            }
            group.cancelAll()  // a losing inline timer is cancelled
        }
        took.append("then " + (try await context.take(\.xs)))
        return took
    }
}

@Workflow
struct NaiveTwoWaiters {
    var pending: [String] = []

    @WorkflowSignal
    mutating func x(input: String) { pending.append(input) }

    /// The naive mapping: one condition per waiter, then pop. TwoWaiters' shape.
    mutating func run(context: WorkflowContext<Self>, input: Void) async throws -> [String: String] {
        @Sendable func take() async throws -> String {
            try await context.condition { !$0.pending.isEmpty }
            return context.mutateState { $0.pending.isEmpty ? "none" : $0.pending.removeFirst() }
        }
        return try await withThrowingTaskGroup(of: (String, String).self) { group in
            group.addTask {
                try await context.sleep(for: .seconds(1))
                return ("created first", try await take())
            }
            group.addTask { ("began first", try await take()) }
            var took: [String: String] = [:]
            for try await (k, v) in group { took[k] = v }
            return took
        }
    }
}

@Workflow
struct NaivePromise {
    var pending: [String] = []

    @WorkflowSignal
    mutating func x(input: String) { pending.append(input) }

    /// The naive promise: `async let` of a waiter, then await X.
    mutating func run(context: WorkflowContext<Self>, input: Void) async throws -> [String: String] {
        @Sendable func take() async throws -> String {
            try await context.condition { !$0.pending.isEmpty }
            return context.mutateState { $0.pending.removeFirst() }
        }
        async let p = take()
        let awaited = try await take()
        return ["promise": try await p, "await": awaited]
    }
}

let arrivalsFixtures: [any WorkflowDefinition.Type] = [
    TwoWaiters.self, PromiseThenAwait.self, CancelledWaiter.self, AwaitOne.self,
    NaiveTwoWaiters.self, NaivePromise.self,
]
