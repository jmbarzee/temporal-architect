import Temporal

/// The `.twf` worker batchTypes: its types and configuration, shared by the worker process and the tests.
enum BatchTypes {
    static let taskQueue = "batches"
    static let workflows: [any WorkflowDefinition.Type] = [Batch.self, Audit.self, Archive.self]

    static func activities(_ container: BatchActivities) -> [any ActivityDefinition] {
        container.allActivities
    }

    static func configuration(namespace: String = "default", serverHostname: String) -> TemporalWorker.Configuration {
        TemporalWorker.Configuration(
            namespace: namespace, taskQueue: taskQueue, instrumentation: .init(serverHostname: serverHostname))
    }
}
