import Foundation
import Temporal
import TemporalTestKit
import Testing

@Suite(.temporalTimeSkippingTestServer, .serialized, .timeLimit(.minutes(2)))
struct CounterTests {
    let server = TemporalTestServer.timeSkippingTestServer!

    /// Runs body with a client while a counterTypes worker polls a task queue of its own.
    func withCounter<Result: Sendable>(
        _ body: sending @escaping (TemporalClient, String) async throws -> Result
    ) async throws -> sending Result {
        let q = "counters-\(UUID())"
        var config = CounterTypes.configuration(serverHostname: server.host())
        config.taskQueue = q
        return try await server.withWorker(
            config, workflows: CounterTypes.workflows, activities: CounterTypes.activities(CounterActivities())
        ) {
            client in try await body(client, q)
        }
    }

    @Test
    func counterCompletesAtTheLimit() async throws {
        let got = try await withCounter { client, q in
            try await client.executeWorkflow(
                type: Counter.self,
                options: .init(id: "counter-1", taskQueue: q),
                input: Counter.Input(count: 2, limit: 3)
            )
        }
        #expect(got == 3)
    }

    @Test
    func counterContinuesAsNewBelowIt() async throws {
        try await withCounter { client, q in
            let h = try await client.startWorkflow(
                type: Counter.self,
                options: .init(id: "counter-2", taskQueue: q),
                input: Counter.Input(count: 0, limit: 3)
            )
            // result() follows the chain of runs to the last one's result.
            #expect(try await h.result() == 3)
            let first = client.workflowHandle(type: Counter.self, id: h.id, runID: h.firstExecutionRunID)
            #expect(try await first.describe().execution.status == .continuedAsNew)
        }
    }

    @Test
    func wireNamesAreTheTwfNames() {
        #expect(Counter.name == "Counter")
        #expect(CounterActivities.Activities.Increment.name == "Increment")
    }
}
