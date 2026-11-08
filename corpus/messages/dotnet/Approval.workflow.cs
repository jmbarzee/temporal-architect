namespace Corpus.Messages;

using Temporalio.Workflows;

public record Decision(string Request, string Approver, string Note, string Status);

// The class name is the workflow's wire name; the SDK trims "Async" from signal and update methods.
[Workflow]
public class Approval
{
    private readonly Arrivals<bool> opens = new();
    private readonly Arrivals<string> approves = new();
    private readonly Arrivals<string> reviews = new();
    private string status = "submitted";

    [WorkflowRun]
    public async Task<Decision> RunAsync(string request)
    {
        await opens.TakeAsync();
        var approval = approves.TakeAsync(); // begins waiting here, at its binding
        var note = await reviews.TakeAsync();
        var approver = await approval;
        return new(request, approver, note, status);
    }

    [WorkflowSignal]
    public Task OpenAsync()
    {
        status = "open";
        opens.Add(true);
        return Task.CompletedTask;
    }

    [WorkflowSignal]
    public Task ApproveAsync(string approver)
    {
        status = "approved";
        approves.Add(approver);
        return Task.CompletedTask;
    }

    [WorkflowUpdate]
    public Task<string> ReviewAsync(string note)
    {
        status = "reviewed";
        reviews.Add(note);
        return Task.FromResult(status);
    }

    [WorkflowQuery]
    public string Status() => status;
}
