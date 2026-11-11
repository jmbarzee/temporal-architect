import Foundation
import Temporal
import TemporalTestKit
import Testing

@Suite(.temporalTimeSkippingTestServer, .serialized, .timeLimit(.minutes(2)))
struct JobTests {
    let server = TemporalTestServer.timeSkippingTestServer!

    struct NotSettled: Error {}

    /// Throws if op has not returned within 10s, so a wait for the held Process fails rather than hangs.
    func within<T: Sendable>(_ op: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T?.self) { group in
            group.addTask { try await op() }
            group.addTask {
                try await Task.sleep(for: .seconds(10))
                return nil
            }
            defer { group.cancelAll() }
            guard let got = try await group.next()! else { throw NotSettled() }
            return got
        }
    }

    /// Whether err's cause is Reject's failure.
    func rejected(_ cause: (any Error)?) -> Bool {
        (cause as? ActivityError)?.activityType == "Reject"
    }

    @Test
    func rejectFailsTheUpdateThenTheRunWhileProcessIsHeldAndNeverCancelled() async throws {
        let server = self.server
        let q = "jobs-\(UUID())"
        var config = JobTypes.configuration(serverHostname: server.host())
        config.taskQueue = q
        // Each Process is held until the test ends, so it is still running when Reject fails.
        let (released, release) = AsyncStream<Void>.makeStream()
        let activities = JobTypes.activities(JobActivities(hold: { for await _ in released { return } }))
        try await server.withWorker(config, workflows: JobTypes.workflows, activities: activities) { client in
            defer { release.finish() }
            let h = try await client.startWorkflow(
                type: Job.self, options: .init(id: "job-\(UUID())", taskQueue: q), input: "a")

            await #expect(throws: WorkflowUpdateFailedError.self) {
                do {
                    try await self.within { try await h.executeUpdate(updateType: Job.Attempt.self, input: ()) }
                } catch let e as WorkflowUpdateFailedError {
                    #expect(self.rejected(e.cause), "the update failed with \(e)")
                    throw e
                }
            }
            #expect(try await h.describe().execution.status == .running, "the failed update failed the run")

            try await h.signal(signalType: Job.Proceed.self)
            await #expect(throws: WorkflowFailedError.self) {
                do {
                    try await self.within { try await h.result() }
                } catch let e as WorkflowFailedError {
                    #expect(self.rejected(e.cause), "the run failed with \(e)")
                    throw e
                }
            }

            let events = try await h.fetchHistoryEvents()
            let processes = events.filter {
                $0.eventType == .activityTaskScheduled
                    && $0.activityTaskScheduledEventAttributes.activityType.name == "Process"
            }
            #expect(processes.count == 2, "Process did not start beside Reject in both await alls")
            #expect(!events.contains { $0.eventType == .activityTaskCompleted }, "Process completed first")
            #expect(!events.contains { $0.eventType == .activityTaskCancelRequested }, "Process was cancelled")
        }
    }

    @Test
    func wireNamesAreTheTwfNames() {
        #expect(Job.name == "Job")
        #expect(Job.Proceed.name == "Proceed")
        #expect(Job.Attempt.name == "Attempt")
        #expect(JobActivities.Activities.Reject.name == "Reject")
        #expect(JobActivities.Activities.Process.name == "Process")
    }
}
