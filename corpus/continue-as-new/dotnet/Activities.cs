namespace Corpus.ContinueAsNew;

using Temporalio.Activities;

public static class Activities
{
    [Activity]
    public static long Increment(long count) => count + 1;
}
