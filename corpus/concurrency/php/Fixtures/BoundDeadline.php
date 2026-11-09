<?php

declare(strict_types=1);

namespace Corpus\Concurrency\Fixtures;

use Corpus\Concurrency\Arrivals;
use Temporal\Workflow;
use Temporal\Workflow\SignalMethod;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** A promise bound once, timer(24h), raced against Ack every round; returns the Acks counted. */
#[WorkflowInterface]
final class BoundDeadline
{
    /** @var Arrivals<true> */
    private Arrivals $acks;

    public function __construct()
    {
        $this->acks = new Arrivals();
    }

    #[SignalMethod(name: 'Ack')]
    public function ack(): void
    {
        $this->acks->add(true);
    }

    #[WorkflowMethod]
    public function run(): \Generator
    {
        $counted = 0;
        // promise deadline <- timer(24h): bound before the rounds, so losing one never cancels it.
        $fired = false;
        Workflow::async(static function () use (&$fired): \Generator {
            // The flag is set as the timer's result is applied, not when this scope next runs.
            yield Workflow::timer(86400)->then(static function () use (&$fired): void {
                $fired = true;
            });
        });
        while (true) {
            $ticket = $this->acks->begin(); // a fresh ticket each round
            // A closure, not fn(): an arrow function captures $fired by value.
            yield Workflow::await(function () use ($ticket, &$fired): bool { return $this->acks->ready($ticket) || $fired; });
            if (!$this->acks->ready($ticket)) {
                $this->acks->leave($ticket);
                return $counted;
            }
            $this->acks->claim();
            ++$counted;
        }
    }
}
