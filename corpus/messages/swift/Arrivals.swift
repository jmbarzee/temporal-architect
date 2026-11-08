import Temporal

/// A signal's or update's pending arrivals and the waiters for them (spec 06).
///
/// A handler adds an arrival when it returns, and the waiter that began waiting
/// first takes the oldest. Held as workflow state, so handlers and the run method share it.
struct Arrivals<T: Sendable>: Sendable {
    private var pending: [T] = []
    private var waiters: [Int] = []  // tickets, in the order their waiters began
    private var next = 0

    mutating func add(_ v: T) {
        pending.append(v)
    }

    /// Begins a waiter. A promise begins at its binding; an await one case
    /// checks `ready`, claims only if it wins, and leaves either way.
    mutating func begin() -> Int {
        defer { next += 1 }
        waiters.append(next)
        return next
    }

    /// Whether an arrival is pending and ticket is the earliest waiter.
    func ready(_ ticket: Int) -> Bool {
        !pending.isEmpty && waiters.first == ticket
    }

    /// Gives the oldest arrival to the earliest waiter, which must be ready.
    mutating func claim() -> T {
        waiters.removeFirst()
        return pending.removeFirst()
    }

    /// Ends a waiter that did not claim; after a claim it does nothing.
    mutating func leave(_ ticket: Int) {
        waiters.removeAll { $0 == ticket }
    }
}

extension WorkflowContext {
    /// Waits until the waiter at ticket is ready, then takes its arrival. A cancelled waiter leaves.
    func take<T>(_ arrivals: WritableKeyPath<Workflow, Arrivals<T>>, at ticket: Int) async throws -> T {
        do {
            try await condition { $0[keyPath: arrivals].ready(ticket) }
        } catch {
            mutateState { $0[keyPath: arrivals].leave(ticket) }
            throw error
        }
        return mutateState { $0[keyPath: arrivals].claim() }
    }

    /// Begins a waiter and takes its arrival (`await signal X`, `await update X`).
    func take<T>(_ arrivals: WritableKeyPath<Workflow, Arrivals<T>>) async throws -> T {
        try await take(arrivals, at: mutateState { $0[keyPath: arrivals].begin() })
    }
}
