<?php

declare(strict_types=1);

namespace Corpus\Concurrency\Fixtures;

use Temporal\Promise;
use Temporal\Workflow;
use Temporal\Workflow\SignalMethod;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/**
 * Batch's await one over Ack and timer(1h), with the cases listed in $order; returns the winner.
 * $form 'await one' is the mapping; 'any' and 'awaitWithTimeout' are the tempting forms.
 */
#[WorkflowInterface]
final class AwaitOneTie
{
    private int $acks = 0;

    #[SignalMethod(name: 'Ack')]
    public function ack(): void
    {
        ++$this->acks;
    }

    /**
     * Test plumbing: blocks the single PHP workflow process for $ms of real time (on replay too: the retried task replays it),
     * so the timer's firing and Ack queue up behind this workflow task and reach the next one together.
     */
    #[SignalMethod(name: 'Hold')]
    public function hold(int $ms): void
    {
        \usleep($ms * 1000);
    }

    /** @param list<string> $order */
    #[WorkflowMethod]
    public function run(array $order, string $form, int $timerSeconds): \Generator
    {
        if ($form === 'awaitWithTimeout') {
            return (yield Workflow::awaitWithTimeout($timerSeconds, fn(): bool => $this->acks > 0)) ? 'Ack' : 'timer';
        }

        $fired = false;
        $timer = Workflow::async(static function () use (&$fired, $timerSeconds): \Generator {
            // The flag is set as the timer's result is applied, not when this scope next runs.
            yield Workflow::timer($timerSeconds)->then(static function () use (&$fired): void {
                $fired = true;
            });
        });

        if ($form === 'any') {
            $cases = [];
            foreach ($order as $c) {
                $cases[] = $c === 'Ack'
                    ? Workflow::await(fn(): bool => $this->acks > 0)->then(static fn() => 'Ack')
                    : $timer->then(static fn() => 'timer');
            }
            return yield Promise::any($cases);
        }

        yield Workflow::await(function () use (&$fired): bool { return $this->acks > 0 || $fired; });
        foreach ($order as $c) {
            if ($c === 'Ack' ? $this->acks > 0 : $fired) {
                if ($c === 'Ack') {
                    $timer->cancel();
                }
                return $c;
            }
        }
        throw new \LogicException('no case ready');
    }
}
