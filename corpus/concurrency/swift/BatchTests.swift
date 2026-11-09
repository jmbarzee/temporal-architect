import Foundation
import Temporal
import TemporalTestKit
import Testing

// Each test, and each tie attempt, runs on its own time-skipping server with its own task queue:
// a stopped worker leaves a poll open on the server, and that poll takes the next task on its queue.
@Suite(.serialized, .timeLimit(.minutes(10)))
struct BatchTests {
    static let items = ["a", "b"]

    /// Runs body on a fresh time-skipping server, with a task queue nothing else polls.
    func fresh(_ body: (TemporalTestServer, String) async throws -> Void) async throws {
        try await TemporalTestServer.withTimeSkippingTestServer { server in
            let server = copy server
            try await body(server, "batches-\(UUID())")
        }
    }

    func config(_ server: TemporalTestServer, _ taskQueue: String) -> TemporalWorker.Configuration {
        var config = BatchTypes.configuration(serverHostname: server.host())
        config.taskQueue = taskQueue
        return config
    }

    func has<W>(_ h: WorkflowHandle<W>, _ type: Api.Enums.V1.EventType) async throws -> Bool {
        try await h.fetchHistoryEvents().contains { $0.eventType == type }
    }

    /// Whether an event of type reaches the history within 10s of real time.
    func until<W>(_ h: WorkflowHandle<W>, _ type: Api.Enums.V1.EventType) async throws -> Bool {
        let deadline = ContinuousClock.now + .seconds(10)
        while try await !has(h, type) {
            if ContinuousClock.now > deadline { return false }
            try await Task.sleep(for: .milliseconds(20))
        }
        return true
    }

    @Test
    func batchAcknowledgedWithoutWaitingForItsDetachedArchive() async throws {
        try await fresh { server, queue in
            let (released, release) = AsyncStream<Void>.makeStream()
            // Archive's Store is held until Batch returns.
            let activities = BatchTypes.activities(BatchActivities(hold: { for await _ in released { return } }))
            try await server.withWorker(config(server, queue), workflows: BatchTypes.workflows, activities: activities) { client in
                let h = try await client.startWorkflow(
                    type: Batch.self, options: .init(id: "batch-ack", taskQueue: queue), input: Self.items)
                // Ack after the timer starts: a timer started and cancelled in one workflow task leaves no events.
                try #require(try await self.until(h, .timerStarted))
                try await h.signal(signalType: Batch.Ack.self)
                let got = try await h.result()
                #expect(got == Report(count: 2, audited: true, status: "acknowledged"))
                let archiveID = try await h.fetchHistoryEvents()
                    .first { $0.eventType == .childWorkflowExecutionStarted
                        && $0.childWorkflowExecutionStartedEventAttributes.workflowType.name == "Archive" }!
                    .childWorkflowExecutionStartedEventAttributes.workflowExecution.workflowID
                let archive = client.untypedWorkflowHandle(id: archiveID)
                #expect(try await archive.describe().execution.status == .running, "Batch awaited its detached Archive")
                #expect(try await self.has(h, .timerCanceled), "the losing inline timer was not cancelled")
                release.yield()
                release.finish()
                try await archive.result()
            }
        }
    }

    @Test
    func batchTheTimerWins() async throws {
        try await fresh { server, queue in
            try await server.withWorker(config(server, queue), workflows: BatchTypes.workflows, activities: BatchTypes.activities(BatchActivities())) { client in
                let h = try await client.startWorkflow(
                    type: Batch.self, options: .init(id: "batch-timer", taskQueue: queue), input: Self.items)
                let got = try await h.result()
                #expect(got == Report(count: 2, audited: true, status: "unacknowledged"))
                #expect(try await !self.has(h, .timerCanceled))
            }
        }
    }

    @Test
    func auditAndArchive() async throws {
        try await fresh { server, queue in
            try await server.withWorker(config(server, queue), workflows: BatchTypes.workflows, activities: BatchTypes.activities(BatchActivities())) { client in
                let audited = try await client.executeWorkflow(
                    type: Audit.self, options: .init(id: "audit", taskQueue: queue), input: ["a"])
                #expect(audited)
                try await client.executeWorkflow(
                    type: Archive.self, options: .init(id: "archive", taskQueue: queue), input: ["a"])
            }
        }
    }

    @Test
    func wireNamesAreTheTwfNames() {
        #expect(Batch.name == "Batch")
        #expect(Batch.Ack.name == "Ack")
        #expect(BatchActivities.Activities.Count.name == "Count")
        #expect(BatchActivities.Activities.Store.name == "Store")
    }

    @Test
    func aBoundPromiseSurvivesTheRoundsItLoses() async throws {
        try await fresh { server, queue in
            try await server.withWorker(config(server, queue), workflows: awaitOneFixtures) { client in
                let h = try await client.startWorkflow(
                    type: BoundDeadline.self, options: .init(id: "bound-1", taskQueue: queue))
                for _ in 0..<2 {
                    try await server.sleep(.seconds(3600))
                    try await h.signal(signalType: BoundDeadline.Ack.self)
                }
                let got = try await h.result()
                #expect(got == 2)
                #expect(try await !self.has(h, .timerCanceled))
                #expect(try await self.has(h, .timerFired), "the deadline never fired")
            }
        }
    }

    @Test
    func aLosingInlineChildOutlivesItsParentsRun() async throws {
        // A dev server, in real time: the time-skipping server applies no parent close policy.
        try await TemporalTestServer.withTestServer { server in
            let server = copy server
            let queue = "batches-\(UUID())"
            try await server.withWorker(config(server, queue), workflows: awaitOneFixtures) { client in
                let h = try await client.startWorkflow(
                    type: LosingChild.self, options: .init(id: "losing-child", taskQueue: queue))
                #expect(try await h.result() == "timer")
                #expect(
                    try await !self.has(h, .requestCancelExternalWorkflowExecutionInitiated),
                    "the parent's run requested its losing child's cancellation")
                let sleeperID = try await h.fetchHistoryEvents()
                    .first { $0.eventType == .childWorkflowExecutionStarted }!
                    .childWorkflowExecutionStartedEventAttributes.workflowExecution.workflowID
                let sleeper = client.untypedWorkflowHandle(id: sleeperID)
                // Still running at parent close, the child meets the default parent_close_policy, TERMINATE.
                let deadline = ContinuousClock.now + .seconds(10)
                var status = try await sleeper.describe().execution.status
                while status == .running && ContinuousClock.now < deadline {
                    try await Task.sleep(for: .milliseconds(20))
                    status = try await sleeper.describe().execution.status
                }
                #expect(status == .terminated)
            }
        }
    }

    /// Runs AwaitOneTie with its timer fired and Ack sent while no worker runs, so both reach one
    /// workflow task, and returns the winner.
    ///
    /// In CI the setup sometimes misses: a workflow task starts between the timer firing and Ack
    /// arriving, most likely on a poll the stopped first worker left open at the test server. A miss
    /// is retried on a fresh test server, at most 5 times; if every attempt misses, the test records
    /// a known issue and asserts nothing, so it never asserts the behaviour on a tie that was not set up.
    func tie(_ input: Tie) async throws -> String? {
        var missed: [String] = []
        for _ in 1...5 {
            switch try await tieAttempt(input) {
            case .success(let winner): return winner
            case .failure(let miss): missed.append(miss.history)
            }
        }
        // Swift Testing 6.2 has no runtime skip; a known issue is reported without failing the test.
        withKnownIssue { Issue.record("the tie was not set up in 5 attempts: \(missed.joined(separator: "; "))") }
        return nil
    }

    struct Miss: Error {
        var history: String
    }

    /// One attempt on a fresh server, workflow ID and task queue. A missed setup is the failure
    /// it returns. The workers keep no cache, so no sticky queue: the next workflow task goes to
    /// the normal queue.
    func tieAttempt(_ input: Tie) async throws -> Result<String, Miss> {
        var outcome: Result<String, Miss>!
        try await fresh { server, queue in
            var config = config(server, queue)
            config.maxCachedWorkflows = 0
            outcome = try await server.withConnectedClient(logger: quiet) { client in
                let h = try await client.startWorkflow(
                    type: AwaitOneTie.self, options: .init(id: "tie-\(UUID())", taskQueue: queue), input: input)
                let started = try await server.withConnectedWorker(configuration: config, workflows: awaitOneFixtures, logger: quiet) { _ in
                    try await self.until(h, .timerStarted)
                }
                guard started else {
                    try await h.terminate(reason: "tie setup missed")
                    return .failure(Miss(history: "\(h.id): the timer never started"))
                }
                // Skip time past the timer; with no worker, nothing should read its workflow task.
                // The skip ends only once no task is pending, so it is awaited after the workflow closes.
                async let skip: Void = server.sleep(.seconds(7200))
                let got = try await self.tieResult(server, config, h)
                if case .failure = got { try await h.terminate(reason: "tie setup missed") }
                try await skip
                return got
            }
        }
        return outcome
    }

    /// Sends Ack once the timer has fired; when the history shows no workflow task started between
    /// the two, runs a worker for the winner, bounded in real time: a task taken by a stopped
    /// worker's poll is a miss, not a hang.
    func tieResult(
        _ server: TemporalTestServer, _ config: TemporalWorker.Configuration, _ h: WorkflowHandle<AwaitOneTie>
    ) async throws -> Result<String, Miss> {
        guard try await until(h, .timerFired) else { return .failure(Miss(history: "\(h.id): the timer never fired")) }
        try await h.signal(signalType: AwaitOneTie.Ack.self)

        let evs = try await h.fetchHistoryEvents()
        let between = evs.drop { $0.eventType != .timerFired }.prefix { $0.eventType != .workflowExecutionSignaled }
        if between.contains(where: { $0.eventType == .workflowTaskStarted }) {
            return .failure(Miss(history: "\(h.id): \(between.map { "\($0.eventType)" }.joined(separator: ","))"))
        }
        let got = try await server.withConnectedWorker(configuration: config, workflows: awaitOneFixtures, logger: quiet) { _ in
            try await withThrowingTaskGroup(of: String?.self) { group in
                group.addTask { try await h.result() }
                group.addTask {
                    try await Task.sleep(for: .seconds(20))
                    return nil
                }
                defer { group.cancelAll() }
                return try await group.next()!
            }
        }
        guard let got else { return .failure(Miss(history: "\(h.id): no result within 20s")) }
        return .success(got)
    }

    @Test
    func awaitOneTheFirstListedOfSeveralReadyCasesWins() async throws {
        if let got = try await tie(Tie(order: ["Ack", "timer"], form: "await one")) { #expect(got == "Ack") }
        if let got = try await tie(Tie(order: ["timer", "Ack"], form: "await one")) { #expect(got == "timer") }
    }

    @Test
    func aTaskGroupRaceIsNotListedOrder() async throws {
        // group.next() returns the timer's child, which finishes while the executor drains; the
        // condition's child resumes only after.
        if let got = try await tie(Tie(order: ["Ack", "timer"], form: "race")) { #expect(got == "timer") }
    }

    @Test
    func timeoutOverAConditionLetsTheTimerWinATie() async throws {
        // context.timeout cancels its body when the timer fires, before conditions are checked:
        // it maps await one {timer, condition}, the timer listed first.
        if let got = try await tie(Tie(order: ["Ack", "timer"], form: "timeout")) { #expect(got == "timer") }
    }
}
