namespace Corpus.Nexus;

using NexusRpc;
using Temporalio.Client;

/// <summary>The GreeterService contract. NexusRpc trims the interface's leading I, and an operation is named for its method.</summary>
[NexusService]
public interface IGreeterService
{
    [NexusOperation]
    string Hello(string name);

    [NexusOperation]
    string Greet(string name);
}

public static class Greeter
{
    public const string Endpoint = "GreeterEndpoint";
    public const string TaskQueue = "greeter";

    /// <summary>Greet's id_scheme, used by every start.</summary>
    public static string GreetId(string name) => $"greet-{name}";

    /// <summary>Greet's start options, built from its id_scheme.</summary>
    public static WorkflowOptions GreetStartOptions(string name) => new() { Id = GreetId(name) };
}
