import Temporal

/// The `.twf` worker counterTypes: its types and configuration, shared by the worker process and the tests.
enum CounterTypes {
    static let taskQueue = "counters"
    static let workflows: [any WorkflowDefinition.Type] = [Counter.self]

    static func activities(_ container: CounterActivities) -> [any ActivityDefinition] {
        container.allActivities
    }

    static func configuration(namespace: String = "default", serverHostname: String) -> TemporalWorker.Configuration {
        TemporalWorker.Configuration(
            namespace: namespace, taskQueue: taskQueue, instrumentation: .init(serverHostname: serverHostname))
    }
}
