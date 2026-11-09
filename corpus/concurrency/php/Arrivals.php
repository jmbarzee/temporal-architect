<?php

declare(strict_types=1);

namespace Corpus\Concurrency;

use Temporal\Workflow\CancellationScopeInterface;
use Temporal\Workflow;

/**
 * A signal's or update's pending arrivals and the waiters for them, each oldest first: a handler
 * adds an arrival when it returns, and the waiter that began waiting first takes the oldest.
 *
 * Waiters hold tickets because one condition pass resolves every waiter whose condition holds
 * (WorkflowContext::resolveConditions) and resumes them later: without tickets two waiters would
 * be released by one arrival and the second would find nothing.
 *
 * @template T
 */
final class Arrivals
{
    /** @var list<T> */
    private array $pending = [];

    /** @var list<int> tickets, in the order their waiters began */
    private array $waiters = [];

    private int $next = 0;

    /** @param T $v */
    public function add(mixed $v): void
    {
        $this->pending[] = $v;
    }

    /**
     * Waits for the oldest arrival: `await signal X` is `yield $xs->take()`, and
     * `promise p <- signal X` is `$p = $xs->take()`; the ticket is taken at the call, so the
     * promise begins waiting at its binding.
     *
     * @return CancellationScopeInterface<T>
     */
    public function take(): CancellationScopeInterface
    {
        $ticket = $this->begin();

        return Workflow::async(function () use ($ticket): \Generator {
            try {
                yield Workflow::await(fn(): bool => $this->ready($ticket));
                return $this->claim();
            } finally {
                $this->leave($ticket);
            }
        });
    }

    /** Begins a waiter. An await one case begins, checks ready without taking, and claims only if it wins; win or lose, it leaves. */
    public function begin(): int
    {
        $ticket = $this->next++;
        $this->waiters[] = $ticket;
        return $ticket;
    }

    /** Whether an arrival is pending and $ticket is the earliest waiter. */
    public function ready(int $ticket): bool
    {
        return $this->pending !== [] && $this->waiters[0] === $ticket;
    }

    /**
     * Gives the oldest arrival to the earliest waiter, which must be ready.
     *
     * @return T
     */
    public function claim(): mixed
    {
        \array_shift($this->waiters);
        return \array_shift($this->pending);
    }

    /** Ends a waiter that did not claim; after a claim it does nothing. */
    public function leave(int $ticket): void
    {
        $this->waiters = \array_values(\array_filter($this->waiters, static fn(int $w): bool => $w !== $ticket));
    }
}
