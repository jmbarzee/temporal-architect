namespace Corpus.Nexus;

using Temporalio.Worker;

/// <summary>Each .twf worker's registrations, shared by the worker process and the tests.</summary>
public static class Workers
{
    /// <summary>The callerTypes worker.</summary>
    public static TemporalWorkerOptions AddCallerTypes(this TemporalWorkerOptions options) =>
        options.AddWorkflow<Caller>();

    /// <summary>The greeterTypes worker.</summary>
    public static TemporalWorkerOptions AddGreeterTypes(this TemporalWorkerOptions options) =>
        options
            .AddWorkflow<Greet>()
            .AddActivity(Activities.Compose)
            .AddNexusService(new GreeterService());
}
