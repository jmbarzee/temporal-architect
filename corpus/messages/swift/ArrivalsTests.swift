import Foundation
import Temporal
import TemporalTestKit
import Testing

@Suite(.temporalTimeSkippingTestServer, .serialized, .timeLimit(.minutes(2)))
struct ArrivalsTests {
    let server = TemporalTestServer.timeSkippingTestServer!

    /// Runs a fixture, sending X "1" after a minute and X "2" after two.
    func withTwoXs<W: WorkflowDefinition>(_ type: W.Type, input: W.Input) async throws -> W.Output
    where W.Input: Sendable, W.Output: Sendable {
        let server = self.server
        let q = "arrivals-\(UUID())"
        var config = ApprovalTypes.configuration(serverHostname: server.host())
        config.taskQueue = q
        return try await server.withWorker(config, workflows: arrivalsFixtures) { client in
            let h = try await client.startWorkflow(
                type: type,
                options: .init(id: "wf-\(UUID())", taskQueue: q),
                input: input
            )
            let x = client.untypedWorkflowHandle(id: h.id)
            try await server.sleep(.seconds(60))
            try await x.signal(signalName: "X", input: "1")
            try await server.sleep(.seconds(60))
            try? await x.signal(signalName: "X", input: "2")  // a fixture that needed one X has completed
            return try await h.result()
        }
    }

    @Test
    func arrivalsGoToWaitersInTheOrderTheyBegan() async throws {
        #expect(try await withTwoXs(TwoWaiters.self, input: ()) == ["began first": "1", "created first": "2"])
    }

    @Test
    func aPromiseBeginsWaitingAtItsBinding() async throws {
        #expect(try await withTwoXs(PromiseThenAwait.self, input: ()) == ["promise": "1", "await": "2"])
    }

    @Test
    func awaitOneTheCaseWinsAndTakes() async throws {
        #expect(try await withTwoXs(AwaitOne.self, input: 3600) == ["case 1", "then 2"])
    }

    @Test
    func awaitOneTheTimerWinsAndTheCaseTakesNothing() async throws {
        #expect(try await withTwoXs(AwaitOne.self, input: 1) == ["timer", "then 1"])
    }

    @Test
    func aCancelledWaiterLeavesTheQueue() async throws {
        #expect(try await withTwoXs(CancelledWaiter.self, input: ()) == "1")
    }

    @Test
    func naiveConditionPerWaiterServesTheOrderTheyBegan() async throws {
        // The SDK resumes one satisfied condition at a time, in registration order, so
        // naive waiters lose nothing and are served in the order they began.
        #expect(try await withTwoXs(NaiveTwoWaiters.self, input: ()) == ["began first": "1", "created first": "2"])
    }

    @Test
    func naiveAsyncLetPromiseBeginsLate() async throws {
        // An async let child first runs when its parent suspends, after the parent's own wait began.
        #expect(try await withTwoXs(NaivePromise.self, input: ()) == ["promise": "2", "await": "1"])
    }
}
