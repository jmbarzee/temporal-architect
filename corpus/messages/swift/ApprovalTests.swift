import Foundation
import Temporal
import TemporalTestKit
import Testing

@Suite(.temporalTimeSkippingTestServer, .serialized, .timeLimit(.minutes(2)))
struct ApprovalTests {
    let server = TemporalTestServer.timeSkippingTestServer!

    func config(_ q: String) -> TemporalWorker.Configuration {
        var config = ApprovalTypes.configuration(serverHostname: server.host())
        config.taskQueue = q
        return config
    }

    @Test
    func approval() async throws {
        let server = self.server
        let q = "approvals-\(UUID())"
        let got = try await server.withWorker(config(q), workflows: ApprovalTypes.workflows) { client in
            let h = try await client.startWorkflow(
                type: Approval.self,
                options: .init(id: "approval-1", taskQueue: q),
                input: "access"
            )
            // Approve arrives before anything waits for it, and stays pending.
            try await server.sleep(.seconds(30))
            try await h.signal(signalType: Approval.Approve.self, input: "Grace")
            try await server.sleep(.seconds(30))
            try await h.signal(signalType: Approval.Open.self)
            try await server.sleep(.seconds(60))
            #expect(try await h.query(queryType: Approval.Status.self) == "open")
            #expect(try await h.executeUpdate(updateType: Approval.Review.self, input: "LGTM") == "reviewed")
            return try await h.result()
        }
        #expect(got == Decision(request: "access", approver: "Grace", note: "LGTM", status: "reviewed"))
    }

    @Test
    func reviewAnsweredBeforeAWaiterTakesIt() async throws {
        let server = self.server
        let q = "approvals-\(UUID())"
        let got = try await server.withWorker(config(q), workflows: ApprovalTypes.workflows) { client in
            let h = try await client.startWorkflow(
                type: Approval.self,
                options: .init(id: "approval-2", taskQueue: q),
                input: "access"
            )
            // Review arrives while Approval still awaits Open, before anything waits for Review.
            try await server.sleep(.seconds(30))
            #expect(try await h.executeUpdate(updateType: Approval.Review.self, input: "LGTM") == "reviewed")
            try await h.signal(signalType: Approval.Open.self)
            try await server.sleep(.seconds(60))
            try await h.signal(signalType: Approval.Approve.self, input: "Grace")
            return try await h.result()
        }
        #expect(got == Decision(request: "access", approver: "Grace", note: "LGTM", status: "approved"))
    }

    @Test
    func wireNamesAreTheTwfNames() {
        #expect(Approval.name == "Approval")
        #expect(Approval.Open.name == "Open")
        #expect(Approval.Approve.name == "Approve")
        #expect(Approval.Review.name == "Review")
        #expect(Approval.Status.name == "Status")
    }
}
