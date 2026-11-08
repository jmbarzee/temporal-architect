import Temporal

/// The `.twf` worker approvalTypes: the types it registers and its configuration.
enum ApprovalTypes {
    static let workflows: [any WorkflowDefinition.Type] = [Approval.self]
    static let activities: [any ActivityDefinition] = []

    static func configuration(namespace: String, taskQueue: String = "approvals", serverHostname: String) -> TemporalWorker.Configuration {
        TemporalWorker.Configuration(
            namespace: namespace,
            taskQueue: taskQueue,
            instrumentation: .init(serverHostname: serverHostname)
        )
    }
}
