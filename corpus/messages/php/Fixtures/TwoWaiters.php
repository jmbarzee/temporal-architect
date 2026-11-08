<?php

declare(strict_types=1);

namespace Corpus\Messages\Fixtures;

use Temporal\Promise;
use Temporal\Workflow;
use Temporal\Workflow\ReturnType;
use Temporal\Workflow\WorkflowInterface;
use Temporal\Workflow\WorkflowMethod;

/** Two waiters of X; the one started first sleeps before it waits, so the other begins waiting first. */
#[WorkflowInterface]
final class TwoWaiters
{
    use OfX;

    #[WorkflowMethod]
    #[ReturnType('array')]
    public function run(): \Generator
    {
        $took = [];
        $createdFirst = Workflow::async(function () use (&$took): \Generator {
            yield Workflow::timer(1);
            $took['created first'] = yield $this->xs()->take();
        });
        $beganFirst = Workflow::async(function () use (&$took): \Generator {
            $took['began first'] = yield $this->xs()->take();
        });
        yield Promise::all([$createdFirst, $beganFirst]);
        \ksort($took);
        return $took;
    }
}
