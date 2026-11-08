<?php

declare(strict_types=1);

namespace Corpus\Messages\Fixtures;

use Temporal\Promise;
use Temporal\Workflow;
use Temporal\Workflow\ReturnType;
use Temporal\Workflow\SignalMethod;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** The naive mapping: each waiter awaits a non-empty queue, then takes its head. */
#[WorkflowInterface]
final class NaiveTwoWaiters
{
    /** @var list<string> */
    private array $pending = [];

    #[SignalMethod(name: 'X')]
    public function x(string $v): void
    {
        $this->pending[] = $v;
    }

    private function take(): \Generator
    {
        yield Workflow::await(fn(): bool => $this->pending !== []);
        return $this->pending === [] ? 'lost' : \array_shift($this->pending);
    }

    #[WorkflowMethod]
    #[ReturnType('array')]
    public function run(): \Generator
    {
        $took = [];
        $createdFirst = Workflow::async(function () use (&$took): \Generator {
            yield Workflow::timer(1);
            $took['created first'] = yield from $this->take();
        });
        $beganFirst = Workflow::async(function () use (&$took): \Generator {
            $took['began first'] = yield from $this->take();
        });
        yield Promise::all([$createdFirst, $beganFirst]);
        \ksort($took);
        return $took;
    }
}
