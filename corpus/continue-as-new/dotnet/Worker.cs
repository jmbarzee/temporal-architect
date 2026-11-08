namespace Corpus.ContinueAsNew;

using Temporalio.Worker;

/// <summary>Each .twf worker's registrations, shared by the worker process and the tests.</summary>
public static class Workers
{
    /// <summary>The counterTypes worker.</summary>
    public static TemporalWorkerOptions AddCounterTypes(this TemporalWorkerOptions options) =>
        options
            .AddWorkflow<Counter>()
            .AddActivity(Activities.Increment);
}
