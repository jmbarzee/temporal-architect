import Temporal

/// The `.twf` worker batchTypes: the types it registers and its configuration.
enum BatchTypes {
    static let workflows: [any WorkflowDefinition.Type] = [Batch.self, Audit.self, Archive.self]

    static func activities(_ container: BatchActivities = BatchActivities()) -> [any ActivityDefinition] {
        container.allActivities
    }

    static func configuration(namespace: String, taskQueue: String = "batches", serverHostname: String) -> TemporalWorker.Configuration {
        TemporalWorker.Configuration(
            namespace: namespace,
            taskQueue: taskQueue,
            instrumentation: .init(serverHostname: serverHostname)
        )
    }
}
