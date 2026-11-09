import Temporal

@ActivityContainer
struct BatchActivities {
    /// Store waits for this before it returns; nil returns at once. Set only by tests.
    let hold: (@Sendable () async -> Void)?

    init(hold: (@Sendable () async -> Void)? = nil) {
        self.hold = hold
    }

    @Activity
    func count(input: [String]) -> Int {
        input.count
    }

    @Activity
    func store(input: [String]) async {
        await hold?()
    }
}
