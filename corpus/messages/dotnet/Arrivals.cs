namespace Corpus.Messages;

using Temporalio.Workflows;

/// <summary>
/// A signal's or update's pending arrivals, oldest first: a handler adds an arrival when it
/// returns, and a waiter takes the oldest. Waiters are served in the order they began waiting
/// because the workflow resolves only the first satisfied WaitConditionAsync, in the order the
/// waits began, and lets its continuation run before checking the next. So no two waiters see
/// one arrival, and a plain queue needs no tickets (Temporalio 1.21.1 WorkflowInstance.cs:636
/// and 992-1010, under the modern event loop every new workflow runs).
/// </summary>
/// <typeparam name="T">The arrival's parameters.</typeparam>
public sealed class Arrivals<T>
{
    private readonly Queue<T> pending = new();

    /// <summary>Gets a value indicating whether an arrival is pending.</summary>
    public bool Ready => pending.Count > 0;

    /// <summary>Adds an arrival; a handler calls it last.</summary>
    public void Add(T value) => pending.Enqueue(value);

    /// <summary>
    /// Waits for the oldest arrival. The wait begins at the call, so a promise
    /// (<c>var p = xs.TakeAsync();</c>) begins waiting at its binding.
    /// </summary>
    public async Task<T> TakeAsync(CancellationToken? cancellationToken = null)
    {
        await Workflow.WaitConditionAsync(() => Ready, cancellationToken);
        return pending.Dequeue();
    }

    /// <summary>Takes the oldest arrival; an await one case calls it only when it wins.</summary>
    public T Claim() => pending.Dequeue();
}
