namespace Corpus.Nexus;

using Temporalio.Activities;

public static class Activities
{
    [Activity]
    public static string Compose(string name) => "Greetings, " + name;
}
