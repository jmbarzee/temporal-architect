import Temporal

/// The `.twf` worker counterTypes: the types it registers and its configuration.
enum CounterTypes {
    static let workflows: [any WorkflowDefinition.Type] = [Counter.self]
    static let activities: [any ActivityDefinition] = CounterActivities().allActivities

    static func configuration(namespace: String, taskQueue: String = "counters", serverHostname: String) -> TemporalWorker.Configuration {
        TemporalWorker.Configuration(
            namespace: namespace,
            taskQueue: taskQueue,
            instrumentation: .init(serverHostname: serverHostname)
        )
    }
}
