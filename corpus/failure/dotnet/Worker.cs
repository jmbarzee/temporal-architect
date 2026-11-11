namespace Corpus.Failure;

using Temporalio.Worker;

/// <summary>Each .twf worker's registrations, shared by the worker process and the tests.</summary>
public static class Workers
{
    /// <summary>The jobTypes worker.</summary>
    public static TemporalWorkerOptions AddJobTypes(this TemporalWorkerOptions options) =>
        options
            .AddWorkflow<Job>()
            .AddActivity(Activities.Reject)
            .AddActivity(Activities.Process);
}
