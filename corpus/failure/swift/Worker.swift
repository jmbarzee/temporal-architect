import Temporal

/// The `.twf` worker jobTypes: its types and configuration, shared by the worker process and the tests.
enum JobTypes {
    static let taskQueue = "jobs"
    static let workflows: [any WorkflowDefinition.Type] = [Job.self]

    static func activities(_ container: JobActivities) -> [any ActivityDefinition] {
        container.allActivities
    }

    static func configuration(namespace: String = "default", serverHostname: String) -> TemporalWorker.Configuration {
        TemporalWorker.Configuration(
            namespace: namespace, taskQueue: taskQueue, instrumentation: .init(serverHostname: serverHostname))
    }
}
