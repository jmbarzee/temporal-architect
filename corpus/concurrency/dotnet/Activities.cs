namespace Corpus.Concurrency;

using Temporalio.Activities;

public static class Activities
{
    [Activity]
    public static long Count(List<string> items) => items.Count;

    [Activity]
    public static void Store(List<string> items)
    {
    }
}
