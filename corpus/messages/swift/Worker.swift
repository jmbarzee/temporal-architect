import Temporal

/// The `.twf` worker approvalTypes: its types and configuration, shared by the worker process and the tests.
enum ApprovalTypes {
    static let taskQueue = "approvals"
    static let workflows: [any WorkflowDefinition.Type] = [Approval.self]

    static func configuration(namespace: String = "default", serverHostname: String) -> TemporalWorker.Configuration {
        TemporalWorker.Configuration(
            namespace: namespace, taskQueue: taskQueue, instrumentation: .init(serverHostname: serverHostname))
    }
}
