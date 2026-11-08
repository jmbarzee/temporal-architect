namespace Corpus.Concurrency;

using Temporalio.Worker;

/// <summary>Each .twf worker's registrations, shared by the worker process and the tests.</summary>
public static class Workers
{
    /// <summary>The batchTypes worker.</summary>
    public static TemporalWorkerOptions AddBatchTypes(this TemporalWorkerOptions options) =>
        options
            .AddWorkflow<Batch>()
            .AddWorkflow<Audit>()
            .AddWorkflow<Archive>()
            .AddActivity(Activities.Count)
            .AddActivity(Activities.Store);
}
