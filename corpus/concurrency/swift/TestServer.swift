import Logging
import Temporal
import TemporalTestKit

let quiet: Logger = {
    var logger = Logger(label: "corpus")
    logger.logLevel = .error
    return logger
}()

extension TemporalTestServer {
    /// Runs body with a client, while a worker with configuration polls; the worker stops when body returns.
    func withWorker<Result: Sendable>(
        _ configuration: TemporalWorker.Configuration,
        workflows: [any WorkflowDefinition.Type],
        activities: [any ActivityDefinition] = [],
        body: sending @escaping (TemporalClient) async throws -> Result
    ) async throws -> sending Result {
        try await withConnectedWorker(
            configuration: configuration,
            activities: activities,
            workflows: workflows,
            logger: quiet
        ) { _ in
            try await self.withConnectedClient(logger: quiet) { client in
                try await body(client)
            }
        }
    }

    func host() -> String { hostAndPort().host }
}
