namespace Corpus.Messages;

using Temporalio.Worker;

/// <summary>Each .twf worker's registrations, shared by the worker process and the tests.</summary>
public static class Workers
{
    /// <summary>The approvalTypes worker.</summary>
    public static TemporalWorkerOptions AddApprovalTypes(this TemporalWorkerOptions options) =>
        options.AddWorkflow<Approval>();
}
