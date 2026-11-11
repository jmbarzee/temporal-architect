namespace Corpus.Failure;

using Temporalio.Activities;
using Temporalio.Exceptions;

public static class Activities
{
    [Activity]
    public static void Reject(string item) =>
        throw new ApplicationFailureException($"rejected {item}", errorType: "Rejected");

    [Activity]
    public static void Process(string item)
    {
    }
}
